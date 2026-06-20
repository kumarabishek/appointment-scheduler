"""Central configuration loaded from environment / .env."""
import os
from functools import lru_cache

from dotenv import load_dotenv

load_dotenv()


class Settings:
    # Vapi
    vapi_api_key: str = os.getenv("VAPI_API_KEY", "")
    vapi_phone_number_id: str = os.getenv("VAPI_PHONE_NUMBER_ID", "")
    vapi_webhook_secret: str = os.getenv("VAPI_WEBHOOK_SECRET", "")

    # LLM "brain" — provider + model that Vapi runs. The provider's API key
    # lives in your Vapi dashboard, NOT here (Vapi makes the model call).
    llm_provider: str = os.getenv("LLM_PROVIDER", "google")
    # Gemini Flash: fast + cheap, best for low-latency phone turns.
    # Verify the exact model id against Vapi's current docs before relying on it.
    model: str = os.getenv("AGENT_MODEL", "gemini-2.0-flash")

    # Voice (TTS) — ElevenLabs, plugged into Vapi. Key also lives in Vapi's
    # dashboard. Pick a voice id from your ElevenLabs voice library.
    voice_provider: str = os.getenv("VOICE_PROVIDER", "11labs")
    eleven_voice_id: str = os.getenv("ELEVEN_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")

    # Ears (STT) — Deepgram is Vapi's default and the telephony standard.
    # Stated explicitly so it's visible and swappable like the others.
    stt_provider: str = os.getenv("STT_PROVIDER", "deepgram")
    stt_model: str = os.getenv("STT_MODEL", "nova-2")

    # Twilio (SMS to owner)
    twilio_account_sid: str = os.getenv("TWILIO_ACCOUNT_SID", "")
    twilio_auth_token: str = os.getenv("TWILIO_AUTH_TOKEN", "")
    twilio_from_number: str = os.getenv("TWILIO_FROM_NUMBER", "")
    owner_phone_number: str = os.getenv("OWNER_PHONE_NUMBER", "")

    # Push (ntfy.sh) — tap-to-pick decisions for edge cases
    ntfy_server: str = os.getenv("NTFY_SERVER", "https://ntfy.sh").rstrip("/")
    ntfy_topic: str = os.getenv("NTFY_TOPIC", "")  # your private, hard-to-guess topic

    # How long the agent will hold the operator while waiting for your tap.
    # Must be <= the Vapi tool server timeout. Keep it tight.
    decision_timeout_seconds: float = float(os.getenv("DECISION_TIMEOUT_SECONDS", "25"))

    # What to do if you don't tap in time on an edge case:
    #   "decline"  -> politely decline, end call, notify you to call back (safe)
    #   "closest"  -> book the soonest offered slot anyway
    edge_fallback: str = os.getenv("EDGE_FALLBACK", "closest")

    # Public URL for inbound webhooks
    public_base_url: str = os.getenv("PUBLIC_BASE_URL", "").rstrip("/")

    def require(self, *names: str) -> None:
        missing = [n for n in names if not getattr(self, n, "")]
        if missing:
            raise RuntimeError(
                "Missing required settings: "
                + ", ".join(missing)
                + ". Copy .env.example to .env and fill them in."
            )


@lru_cache
def get_settings() -> "Settings":
    return Settings()
