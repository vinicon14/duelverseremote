from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Login
    page.goto("http://localhost:5173/auth")
    page.locator("#signin-email").fill("user@test.com")
    page.locator("#signin-password").fill("password")
    page.get_by_role("button", name="Entrar").click()
    page.wait_for_timeout(5000)  # Adicionar uma pausa de 5 segundos

    # Navegar diretamente para a página de amigos
    page.goto("http://localhost:5173/friends")
    page.get_by_role("button", name="Enviar DuelCoins").first.click()

    # Tirar screenshot
    page.screenshot(path="jules-scratch/verification/verification.png")

    context.close()
    browser.close()

with sync_playwright() as playwright:
    run(playwright)
