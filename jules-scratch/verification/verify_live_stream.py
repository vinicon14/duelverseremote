from playwright.sync_api import sync_playwright
import random
import string

def random_string(length=10):
    letters = string.ascii_lowercase
    return ''.join(random.choice(letters) for i in range(length))

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    # Navigate to the auth page
    page.goto("http://localhost:8080/auth")

    # Take a screenshot of the auth page
    page.screenshot(path="jules-scratch/verification/auth_page.png")

    # Wait for the page to load
    page.wait_for_selector('h1:has-text("Acesse sua conta")')

    # Click the "Criar conta" tab
    page.get_by_role("tab", name="Criar conta").click()

    # Fill in the sign up form
    email = f"{random_string()}@example.com"
    password = "password"
    page.get_by_label("Email").fill(email)
    page.get_by_label("Senha").fill(password)
    page.get_by_label("Confirmar Senha").fill(password)

    # Click the sign up button
    page.get_by_role("button", name="Criar conta").click()

    # Wait for navigation to the home page
    page.wait_for_url("http://localhost:8080/")

    # Navigate to the duels page
    page.goto("http://localhost:8080/duels")

    # Click the first duel
    page.locator(".duel-card").first.click()

    # Wait for the duel room to load
    page.wait_for_url("http://localhost:8080/duel/**")

    # Click the "Start Live Stream" button
    page.get_by_role("button", name="Iniciar Transmissão").click()

    # Click the "Watch Live" button
    page.get_by_role("button", name="Assistir Ao Vivo").click()

    # Wait for the live stream page to load
    page.wait_for_url("http://localhost:8080/live/**")

    # Take a screenshot
    page.screenshot(path="jules-scratch/verification/live_stream.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
