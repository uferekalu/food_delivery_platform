import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { Pagination } from "./pagination";

describe("Pagination", () => {
  it("renders nothing when there's only one page", () => {
    const { container } = render(<Pagination page={1} totalPages={1} onChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("disables Previous on the first page and Next on the last page", () => {
    render(<Pagination page={1} totalPages={3} onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next page" })).not.toBeDisabled();
  });

  it("calls onChange with page - 1 / page + 1 from Previous/Next", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Pagination page={2} totalPages={3} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Previous page" }));
    expect(onChange).toHaveBeenLastCalledWith(1);

    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(onChange).toHaveBeenLastCalledWith(3);
  });

  it("calls onChange with the clicked page number and marks the current page with aria-current", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Pagination page={1} totalPages={3} onChange={onChange} />);

    expect(screen.getByRole("button", { name: "Page 1" })).toHaveAttribute("aria-current", "page");

    await user.click(screen.getByRole("button", { name: "Page 3" }));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("collapses far-apart pages behind an ellipsis for a large page count", () => {
    render(<Pagination page={1} totalPages={20} onChange={vi.fn()} />);
    expect(screen.getByText("…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 20" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Page 10" })).not.toBeInTheDocument();
  });
});
