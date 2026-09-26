package com.myproject.grid;

import java.util.List;

/**
 * One block for the AG Grid infinite row model. {@code lastRow} is the total row count.
 */
public record GridPage(List<GridRow> rows, int lastRow) {
}
