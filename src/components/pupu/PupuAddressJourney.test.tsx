import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PupuAddressJourney } from "./PupuAddressJourney";

const addresses = [
  { id: "receiver-a", label: "地址 1", region: "已保存区域",
    detailHint: "3 栋 1201", phoneSuffix: "" },
  { id: "receiver-b", label: "地址 2", region: "已保存区域",
    detailHint: "2 号楼 102", phoneSuffix: "" },
];

describe("PupuAddressJourney", () => {
  it("asks the user to confirm one saved address before continuing", () => {
    const select = vi.fn();
    render(<PupuAddressJourney instanceId="address-1" phase="choose"
      addresses={addresses} onSelect={select} />);
    expect(screen.getByRole("heading", { name: "这次送到哪里？" })).toBeInTheDocument();
    expect(screen.getByText("3 栋 1201")).toBeInTheDocument();
    expect(screen.queryByText(/手机号/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /地址 1/ }));
    expect(select).toHaveBeenCalledWith("receiver-a");
  });

  it("shows a stable loading state", () => {
    render(<PupuAddressJourney instanceId="address-1" phase="loading"
      addresses={[]} />);
    expect(screen.getByRole("status")).toHaveTextContent("正在读取已保存地址");
  });

  it("shows the selected address and resumes the held task once", () => {
    render(<PupuAddressJourney instanceId="address-1" phase="selected"
      addresses={[addresses[0]]} />);
    expect(screen.getByRole("status")).toHaveTextContent("地址已确认");
    expect(screen.getByText("正在继续刚才的需求")).toBeInTheDocument();
  });
});
