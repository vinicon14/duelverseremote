from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)

    # Create contexts for two users
    user1_context = browser.new_context()
    user2_context = browser.new_context()

    user1_page = user1_context.new_page()
    user2_page = user2_context.new_page()

    try:
        # User 1 logs in
        user1_page.goto("http://127.0.0.1:8080/auth")
        user1_page.get_by_label("Email").fill("test-user-v2@example.com")
        user1_page.get_by_label("Senha").fill("password-test-user-v2")
        user1_page.get_by_role("button", name="Entrar").click()

        # User 2 logs in
        user2_page.goto("http://127.0.0.1:8080/auth")
        user2_page.get_by_label("Email").fill("test-admin@example.com")
        user2_page.get_by_label("Senha").fill("password-test-admin")
        user2_page.get_by_role("button", name="Entrar").click()

        # Both users go to matchmaking
        user1_page.goto("http://127.0.0.1:8080/matchmaking")
        user2_page.goto("http://127.0.0.1:8080/matchmaking")

        # Wait for the page to load
        expect(user1_page.get_by_text("Players in queue:")).to_be_visible()
        expect(user2_page.get_by_text("Players in queue:")).to_be_visible()

        # User 1 joins the queue
        user1_page.get_by_role("button", name="Buscar Partida Ranqueada").click()

        # User 2 joins the queue
        user2_page.get_by_role("button", name="Buscar Partida Ranqueada").click()

        # Wait for both users to be redirected to the duel room
        expect(user1_page).to_have_url(lambda url: "/duel/" in url, timeout=20000)
        expect(user2_page).to_have_url(lambda url: "/duel/" in url, timeout=20000)

        # Get duel URL from user 1
        duel_url = user1_page.url

        # User 1 starts a stream
        user1_page.get_by_role("button", name="Transmitir").click()

        # Wait for stream to start
        expect(user1_page.get_by_text("Transmissão iniciada!")).to_be_visible()
        stream_id = duel_url.split("/")[-1] # The stream id is the same as the duel id

        # User 2 navigates to the stream
        user2_page.goto(f"http://127.0.0.1:8080/stream/{stream_id}")

        # Wait for the stream to load and check for lifepoints
        expect(user2_page.get_by_text("Player 1")).to_be_visible()
        expect(user2_page.get_by_text("Player 2")).to_be_visible()

        # Take a screenshot of the stream
        user2_page.screenshot(path="jules-scratch/verification/stream_view.png")

    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
