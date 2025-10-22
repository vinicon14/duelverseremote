from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Navigate to the auth page
    page.goto("http://localhost:8080/auth")

    # Fill in the email and password
    page.get_by_label("Email").fill("admin@example.com")
    page.get_by_label("Senha").fill("password")

    # Click the login button
    page.get_by_role("button", name="Entrar").click()

    # Take a screenshot after login attempt
    page.screenshot(path="jules-scratch/verification/login_attempt.png")

    # Wait for navigation to the admin page
    page.wait_for_url("http://localhost:8080/admin")

    # Click the "Transmissões" tab
    page.get_by_role("tab", name="Transmissões").click()

    # Take a screenshot
    page.screenshot(path="jules-scratch/verification/admin_lives.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
