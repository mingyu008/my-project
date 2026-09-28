import { colorSchemeDarkBlue, themeQuartz } from "ag-grid-community";
import { DARK_QUERY, useMediaQuery } from "./useMediaQuery";

const LIGHT = themeQuartz.withParams({
  fontFamily: "inherit",
  accentColor: "#7c4dff",
  borderColor: "#2b2140",
  headerBackgroundColor: "#ffd23f",
  headerTextColor: "#2b2140",
  headerFontWeight: 800,
  wrapperBorderRadius: 18,
});
const DARK = LIGHT.withPart(colorSchemeDarkBlue).withParams({
  accentColor: "#a78bfa",
  borderColor: "#3a3163",
  backgroundColor: "#221c3b",
});

/** AG Grid theme that follows the OS light/dark setting like the rest of the app. */
export function useGridTheme() {
  return useMediaQuery(DARK_QUERY) ? DARK : LIGHT;
}
