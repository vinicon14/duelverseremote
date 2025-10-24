from playwright.sync_api import sync_playwright, expect
from supabase import create_client, Client
import time
import os
import json
import re

def run(playwright):
    # Get Supabase credentials from environment variables
    supabase_url = os.environ.get("VITE_SUPABASE_URL")
    supabase_key = os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY")
    supabase_project_id = None

    if not supabase_url or not supabase_key:
        # Read from .env file if not set in environment
        with open('.env', 'r') as f:
            env_file_contents = f.read()
            url_match = re.search(r'VITE_SUPABASE_URL="([^"]+)"', env_file_contents)
            key_match = re.search(r'VITE_SUPABASE_PUBLISHABLE_KEY="([^"]+)"', env_file_contents)
            if url_match:
                supabase_url = url_match.group(1)
                try:
                    # Extract project ID from the URL (e.g., https://<project-id>.supabase.co)
                    supabase_project_id = supabase_url.split('.')[0].split('//')[1]
                except IndexError:
                    pass
            if key_match:
                supabase_key = key_match.group(1)


    if not supabase_url or not supabase_key or not supabase_project_id:
        raise ValueError("Supabase URL, Key, and Project ID must be set in .env file")

    supabase: Client = create_client(supabase_url, supabase_key)

    # Create a new user
    creator_email = f"creator{int(time.time())}@example.com"
    password = "password"
    supabase.auth.sign_up({"email": creator_email, "password": password})
    creator_session = supabase.auth.sign_in_with_password({"email": creator_email, "password": password})
    supabase.functions.invoke("set-pro-user", invoke_options={'body': {'user_id': creator_session.user.id}})


    browser = playwright.chromium.launch()
    page = browser.new_page()

    # Set the auth token in local storage
    page.goto("http://127.0.0.1:8080")

    # Construct the correct localStorage key
    local_storage_key = f"sb-{supabase_project_id}-auth-token"

    # Create the session object in the format expected by the application
    session_data = {
        "access_token": creator_session.session.access_token,
        "refresh_token": creator_session.session.refresh_token,
        "user": {
            "id": creator_session.user.id,
            "email": creator_session.user.email,
            "created_at": creator_session.user.created_at.isoformat(),
            "updated_at": creator_session.user.updated_at.isoformat()
        }
    }

    page.evaluate(f"localStorage.setItem('{local_storage_key}', '{json.dumps(session_data)}')")

    # Go to the tournaments page and create a tournament
    page.goto("http://127.0.0.1:8080/tournaments")
    page.get_by_role("button", name="Criar Torneio").click()

    # Wait for the heading of the create tournament page to be visible
    expect(page.get_by_role("heading", name="Criar Novo Torneio")).to_be_visible()

    # Now, fill out the form
    page.locator("#tournamentName").fill("My Test Tournament")
    page.locator("#tournamentDescription").fill("This is a test tournament.")
    page.locator("#startDate").fill("2025-10-26T12:00")
    page.locator("#endDate").fill("2025-10-26T18:00")
    page.locator("#maxParticipants").fill("16")
    page.locator("#prize").fill("1000")
    page.locator("#entryFee").fill("50")
    page.get_by_role("button", name="Criar Torneio").click()

    # Wait for the navigation back to the tournaments page
    expect(page).to_have_url("http://127.0.0.1:8080/tournaments")

    # Log out
    page.evaluate("localStorage.clear()")

    # Create a second user to join the tournament
    joiner_email = f"joiner{int(time.time())}@example.com"
    supabase.auth.sign_up({"email": joiner_email, "password": password})
    joiner_session = supabase.auth.sign_in_with_password({"email": joiner_email, "password": password})

    # Set the auth token for the second user
    session_data = {
        "access_token": joiner_session.session.access_token,
        "refresh_token": joiner_session.session.refresh_token,
        "user": {
            "id": joiner_session.user.id,
            "email": joiner_session.user.email,
            "created_at": joiner_session.user.created_at.isoformat(),
            "updated_at": joiner_session.user.updated_at.isoformat()
        }
    }
    page.evaluate(f"localStorage.setItem('{local_storage_key}', '{json.dumps(session_data)}')")

    # Go to the tournaments page and join the tournament
    page.goto("http://127.0.0.1:8080/tournaments")
    page.locator("text=My Test Tournament").click()
    page.get_by_role("button", name="Inscrever-se").click()

    page.screenshot(path="jules-scratch/verification/verification.png")
    browser.close()

with sync_playwright() as playwright:
    run(playwright)
