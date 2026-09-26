package com.myproject.grid;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Protected: any authenticated user (see SecurityConfig).
 */
@RestController
public class GridController {

    private final GridDataService gridDataService;

    public GridController(GridDataService gridDataService) {
        this.gridDataService = gridDataService;
    }

    @GetMapping("/api/grid/data")
    public GridPage data(
            @RequestParam(defaultValue = "0") int startRow,
            @RequestParam(defaultValue = "100") int endRow,
            @RequestParam(required = false) String sortField,
            @RequestParam(required = false) String sortDirection
    ) {
        return gridDataService.getBlock(startRow, endRow, sortField, sortDirection);
    }
}
