// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SpotChecksScreen } from "./spot-checks.tsx";

afterEach(cleanup);

describe("queueing a re-review", () => {
  it("queues the trimmed value under the chosen filter, and nothing for a blank value", () => {
    const onReReview = vi.fn();
    render(<SpotChecksScreen kinds={[]} samples={[]} onVerdict={() => {}} onResume={() => {}} onReReview={onReReview} />);
    const queue = screen.getByRole("button", { name: "Queue re-review" });
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: "   " } });
    fireEvent.click(queue);
    expect(onReReview).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("By"), { target: { value: "model" } });
    fireEvent.change(screen.getByLabelText("Value"), { target: { value: " opus " } });
    fireEvent.click(queue);
    expect(onReReview).toHaveBeenCalledWith({ model: "opus" });
  });
});
