from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Go to the duel room page (assuming a specific duel ID for verification)
    page.goto("http://127.0.0.1:8080/duel-room/c9f9079f-30b1-469e-8cc6-17f99054098f")

    # Wait for the floating calculator to be visible
    page.wait_for_selector('.draggable-calculator', timeout=60000)

    # Take a screenshot before waiting for the button
    page.screenshot(path="jules-scratch/verification/before_button.png")

    # Click the "hide UI" button
    page.click('button[title="Ocultar UI"]')

    # Take a screenshot
    page.screenshot(path="jules-scratch/verification/verification.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
