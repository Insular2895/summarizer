import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { App } from "./App";

function renderApp(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <App />
    </MemoryRouter>,
  );
}

describe("Summarizer application shell", () => {
  it("renders the Home source entry without mode choices", () => {
    renderApp();

    expect(
      screen.getByRole("heading", {
        name: "Transformez une source en connaissance exploitable",
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Source YouTube")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Vidéo" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Playlist" })).not.toBeInTheDocument();
  });

  it("navigates between the three primary destinations", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("link", { name: "Review" }));
    expect(screen.getByRole("heading", { name: "Aucune vidéo prête" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "History" }));
    expect(screen.getByRole("heading", { name: "Aucune session terminée" })).toBeInTheDocument();
  });

  it("renders a video reading route without review decisions", () => {
    renderApp("/review/video-123");

    expect(screen.getByRole("heading", { name: "Vidéo video-123" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Résumé" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Note" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Transcript" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Garder" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Écarter" })).not.toBeInTheDocument();
  });

  it("shows clear feedback when Home is submitted without a URL", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Commencer" }));

    expect(screen.getByRole("status")).toHaveTextContent(
      "Collez une URL YouTube pour commencer.",
    );
  });
});
