# One image, one origin: Spring Boot serves the API and the React build (docs/DEPLOY.md, DECISIONS D-040).

# --- 1. React build -----------------------------------------------------------
FROM node:22-alpine AS frontend
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Empty base URL: the app calls /api/... on its own origin.
ENV VITE_API_BASE_URL=""
# Test-mode sign-in screens (nickname only). Render passes service env vars as build args, so the one
# AUTH_TEST_MODE variable switches both this build and the backend (app.auth.test-mode).
ARG AUTH_TEST_MODE=false
ENV VITE_AUTH_TEST_MODE=$AUTH_TEST_MODE
RUN npm run build

# --- 2. Spring Boot jar with the React build as static resources ---------------
FROM maven:3.9-eclipse-temurin-17 AS backend
WORKDIR /app/backend
COPY backend/pom.xml ./
RUN mvn -q -B dependency:go-offline
COPY backend/src ./src
COPY --from=frontend /app/frontend/dist ./src/main/resources/static
# Tests run in CI (.github/workflows/ci.yml); the image build only packages.
RUN mvn -q -B -DskipTests package

# --- 3. Runtime ----------------------------------------------------------------
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=backend /app/backend/target/backend-0.0.1-SNAPSHOT.jar app.jar
USER app
# Render free instances have 512 MB: keep the heap and thread stacks small.
ENV SPRING_PROFILES_ACTIVE=prod \
    TZ=Asia/Seoul \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=65 -XX:+UseSerialGC -Xss512k"
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
