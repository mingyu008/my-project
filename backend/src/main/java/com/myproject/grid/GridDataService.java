package com.myproject.grid;

import com.myproject.common.web.BadRequestException;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;

/**
 * Sample data source for the grid. Replace with a repository-backed query when real data exists.
 */
@Service
public class GridDataService {

    public static final int MAX_BLOCK_SIZE = 500;

    private static final String[] CATEGORIES = {"Book", "Electronics", "Food", "Clothing", "Toy"};

    private static final Map<String, Comparator<GridRow>> SORTABLE_FIELDS = Map.of(
            "id", Comparator.comparingLong(GridRow::id),
            "name", Comparator.comparing(GridRow::name),
            "category", Comparator.comparing(GridRow::category),
            "price", Comparator.comparing(GridRow::price),
            "quantity", Comparator.comparingInt(GridRow::quantity)
    );

    private final List<GridRow> rows = IntStream.rangeClosed(1, 250)
            .mapToObj(i -> new GridRow(
                    i,
                    "Item %03d".formatted(i),
                    CATEGORIES[i % CATEGORIES.length],
                    BigDecimal.valueOf(i * 137L % 10_000, 2).setScale(2, RoundingMode.UNNECESSARY),
                    (i * 7) % 50
            ))
            .toList();

    /**
     * @param sortField whitelisted field name or null
     * @param sortDirection "asc" or "desc"
     */
    public GridPage getBlock(int startRow, int endRow, String sortField, String sortDirection) {
        if (startRow < 0 || endRow <= startRow) {
            throw new BadRequestException("startRow must be >= 0 and endRow must be greater than startRow");
        }
        if (endRow - startRow > MAX_BLOCK_SIZE) {
            throw new BadRequestException("At most " + MAX_BLOCK_SIZE + " rows can be requested at once");
        }

        List<GridRow> sorted = rows;
        if (sortField != null && !sortField.isBlank()) {
            Comparator<GridRow> comparator = SORTABLE_FIELDS.get(sortField);
            if (comparator == null) {
                throw new BadRequestException("Unsupported sort field");
            }
            if ("desc".equalsIgnoreCase(sortDirection)) {
                comparator = comparator.reversed();
            } else if (sortDirection != null && !"asc".equalsIgnoreCase(sortDirection)) {
                throw new BadRequestException("sortDirection must be asc or desc");
            }
            sorted = rows.stream().sorted(comparator).toList();
        }

        int from = Math.min(startRow, sorted.size());
        int to = Math.min(endRow, sorted.size());
        return new GridPage(sorted.subList(from, to), sorted.size());
    }
}
