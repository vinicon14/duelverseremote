
import re
from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Capture console logs
    page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))

    # Go to the auth page
    page.goto("http://localhost:8080/auth")
    page.screenshot(path="jules-scratch/verification/login_page.png")

    # Fill in the email and password
    page.get_by_label("Email").fill("test@example.com")
    page.get_by_label("Senha").fill("password")

    # Click the login button
    page.get_by_role("button", name="Entrar").click()

    # Go to the admin settings page
    page.goto("http://localhost:8080/admin/settings")

    # Fill out the form
    page.get_by_label("Email de Suporte").fill("new_support@example.com")
    page.get_by_label("Chave PIX (Cópia e Cola)").fill("new_pix_key")
    page.get_by_label("Link da Loja").fill("https://new-store-url.com")

    # Click the save button
    page.get_by_role("button", name="Salvar Configurações").click()

    # Take a screenshot
    page.screenshot(path="jules-scratch/verification/verification.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
