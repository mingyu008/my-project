import { colorSchemeDarkBlue, themeQuartz } from "ag-grid-community";
import { DARK_QUERY, useMediaQuery } from "./useMediaQuery";

const LIGHT = themeQuartz.withParams({ fontFamily: "inherit" });
const DARK = LIGHT.withPart(colorSchemeDarkBlue);

/** AG Grid theme that follows the OS light/dark setting like the rest of the app. */
export function useGridTheme() {
  return useMediaQuery(DARK_QUERY) ? DARK : LIGHT;
}
