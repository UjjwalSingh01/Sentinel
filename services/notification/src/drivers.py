"""
Sentinel Notification Service — Email Drivers

`EmailDriver` is the protocol every driver implements. `StubEmailDriver`
prints to stdout (and is the source of truth for verification in dev/CI);
`SmtpEmailDriver` actually delivers via SMTP for production.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional

import structlog

from .config import (
    EMAIL_DRIVER,
    SMTP_FROM,
    SMTP_HOST,
    SMTP_PASSWORD,
    SMTP_PORT,
    SMTP_USERNAME,
    SMTP_USE_TLS,
)

log: structlog.stdlib.BoundLogger = structlog.get_logger()


class EmailDriver(ABC):
    """Send an email. Returns True on success, False otherwise."""

    @abstractmethod
    async def send(self, to: str, subject: str, body: str) -> bool: ...


class StubEmailDriver(EmailDriver):
    """No-op driver: logs the email to stdout. Always succeeds."""

    async def send(self, to: str, subject: str, body: str) -> bool:
        log.info(
            "email.stub.send",
            to=to,
            subject=subject,
            body_preview=body[:160],
        )
        # Mirror to stdout in a human-readable form so docker logs show it cleanly.
        print(
            "\n=== STUB EMAIL ===\n"
            f"To:      {to}\n"
            f"Subject: {subject}\n"
            f"---\n{body}\n"
            "==================\n",
            flush=True,
        )
        return True


class SmtpEmailDriver(EmailDriver):
    """Uses aiosmtplib to deliver via SMTP. Fails closed on misconfig."""

    async def send(self, to: str, subject: str, body: str) -> bool:
        if not SMTP_HOST:
            log.error("email.smtp.misconfigured", detail="SMTP_HOST is empty")
            return False

        try:
            # Imported here so the stub driver doesn't need aiosmtplib at startup.
            import aiosmtplib
            from email.message import EmailMessage

            msg = EmailMessage()
            msg["From"] = SMTP_FROM
            msg["To"] = to
            msg["Subject"] = subject
            msg.set_content(body)

            await aiosmtplib.send(
                msg,
                hostname=SMTP_HOST,
                port=SMTP_PORT,
                username=SMTP_USERNAME or None,
                password=SMTP_PASSWORD or None,
                use_tls=SMTP_USE_TLS,
                start_tls=not SMTP_USE_TLS and SMTP_PORT in (587, 25),
            )
            log.info("email.smtp.sent", to=to, subject=subject)
            return True
        except Exception as exc:
            log.error("email.smtp.failed", to=to, error=str(exc))
            return False


_driver: Optional[EmailDriver] = None


def get_driver() -> EmailDriver:
    """Return the singleton driver chosen via EMAIL_DRIVER env var."""
    global _driver
    if _driver is None:
        if EMAIL_DRIVER == "smtp":
            _driver = SmtpEmailDriver()
        else:
            _driver = StubEmailDriver()
        log.info("email.driver.selected", driver=EMAIL_DRIVER)
    return _driver
