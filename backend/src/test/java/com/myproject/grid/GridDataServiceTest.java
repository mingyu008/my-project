package com.myproject.grid;

import com.myproject.common.web.BadRequestException;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GridDataServiceTest {

    private final GridDataService service = new GridDataService();

    @Test
    void returnsRequestedBlockAndTotal() {
        GridPage page = service.getBlock(100, 200, null, null);

        assertThat(page.rows()).hasSize(100);
        assertThat(page.rows().get(0).id()).isEqualTo(101);
        assertThat(page.lastRow()).isEqualTo(250);
    }

    @Test
    void lastBlockIsTruncated() {
        assertThat(service.getBlock(200, 300, null, null).rows()).hasSize(50);
        assertThat(service.getBlock(300, 400, null, null).rows()).isEmpty();
    }

    @Test
    void sortsByWhitelistedField() {
        GridPage asc = service.getBlock(0, 250, "price", "asc");
        GridPage desc = service.getBlock(0, 250, "price", "desc");

        assertThat(asc.rows()).isSortedAccordingTo((a, b) -> a.price().compareTo(b.price()));
        assertThat(desc.rows().get(0).price()).isEqualTo(asc.rows().get(249).price());
    }

    @Test
    void rejectsInvalidInput() {
        assertThatThrownBy(() -> service.getBlock(-1, 10, null, null)).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.getBlock(10, 10, null, null)).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.getBlock(0, 501, null, null)).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.getBlock(0, 10, "unknown", null)).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> service.getBlock(0, 10, "id", "sideways")).isInstanceOf(BadRequestException.class);
    }
}
