from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Go to the matchmaking page
    page.goto("http://127.0.0.1:8080/matchmaking")

    # Wait for the page to load
    page.wait_for_selector('button:has-text("Buscar Partida")')

    # Take a screenshot
    page.screenshot(path="jules-scratch/verification/verification.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
