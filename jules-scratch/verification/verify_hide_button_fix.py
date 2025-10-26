from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        page.goto("http://127.0.0.1:8080/auth")
        page.get_by_label("Email").fill("test-user-v2@example.com")
        page.get_by_label("Senha").fill("password-test-user-v2")
        page.get_by_role("button", name="Entrar").click()

        page.goto("http://127.0.0.1:8080/duels")

        # Create a new duel
        page.get_by_role("button", name="Criar Duelo").click()

        # Wait for the duel room to load by looking for the "Chamar Juiz" button
        expect(page.get_by_title("Chamar Juiz")).to_be_visible(timeout=15000)

        # Screenshot before hiding elements
        page.screenshot(path="jules-scratch/verification/verification_before_hide.png")

        # Hide elements and take screenshot
        hide_button = page.get_by_title("Ocultar elementos")
        hide_button.click()
        page.wait_for_timeout(500) # Wait for animation
        page.screenshot(path="jules-scratch/verification/verification_hidden.png")

        # Check that the leave button is not visible
        expect(page.get_by_role("button", name="Sair")).not_to_be_visible()

        # Show elements and take screenshot
        show_button = page.get_by_title("Mostrar elementos")
        show_button.click()
        page.wait_for_timeout(500) # Wait for animation
        page.screenshot(path="jules-scratch/verification/verification_shown.png")

        # Check that the leave button is visible again
        expect(page.get_by_role("button", name="Sair")).to_be_visible()

    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
