import { render, screen } from "@testing-library/react";
import App from "@/App";

describe("App", () => {
  it("renderiza o nome do projeto", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "Geotek.ai" })).toBeInTheDocument();
  });
});
