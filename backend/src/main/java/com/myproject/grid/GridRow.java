package com.myproject.grid;

import java.math.BigDecimal;

public record GridRow(long id, String name, String category, BigDecimal price, int quantity) {
}
