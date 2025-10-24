from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch()
    page = browser.new_page()

    # Go to the tournaments page
    page.goto("http://127.0.0.1:8080/tournaments")

    # Click the button to navigate to the create tournament page
    page.get_by_role("button", name="Criar Torneio").click()

    # Wait for the heading of the create tournament page to be visible
    expect(page.get_by_role("heading", name="Criar Novo Torneio")).to_be_visible()

    # Now, fill out the form using CSS selectors
    page.locator("#tournamentName").fill("My Test Tournament")
    page.locator("#tournamentDescription").fill("This is a test tournament.")
    page.locator("#startDate").fill("2025-10-26T12:00")
    page.locator("#endDate").fill("2025-10-26T18:00")
    page.locator("#maxParticipants").fill("16")
    page.locator("#prize").fill("1000")
    page.locator("#entryFee").fill("50")

    page.screenshot(path="jules-scratch/verification/verification.png")
    browser.close()

with sync_playwright() as playwright:
    run(playwright)
