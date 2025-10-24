from playwright.sync_api import sync_playwright
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
    email = f"testuser{int(time.time())}@example.com"
    password = "password"
    user = supabase.auth.sign_up({"email": email, "password": password})

    # Log in as the new user
    session = supabase.auth.sign_in_with_password({"email": email, "password": password})

    # Set the user as a PRO
    supabase.functions.invoke("set-pro-user", invoke_options={'body': {'user_id': session.user.id}})

    browser = playwright.chromium.launch()
    page = browser.new_page()

    # Set the auth token in local storage
    page.goto("http://127.0.0.1:8080")

    # Construct the correct localStorage key
    local_storage_key = f"sb-{supabase_project_id}-auth-token"

    # Create the session object in the format expected by the application
    session_data = {
        "access_token": session.session.access_token,
        "refresh_token": session.session.refresh_token,
        "user": {
            "id": session.user.id,
            "email": session.user.email,
            "created_at": session.user.created_at.isoformat(),
            "updated_at": session.user.updated_at.isoformat()
        }
    }

    page.evaluate(f"localStorage.setItem('{local_storage_key}', '{json.dumps(session_data)}')")

    # Go to the tournaments page and verify the button is enabled
    page.goto("http://127.0.0.1:8080/tournaments")
    page.get_by_role("button", name="Criar Torneio").click()
    page.screenshot(path="jules-scratch/verification/verification.png")
    browser.close()

with sync_playwright() as playwright:
    run(playwright)
