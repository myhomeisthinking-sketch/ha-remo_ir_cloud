"""Minimal Nature Remo Cloud API client."""
from __future__ import annotations

import asyncio
import re
from collections.abc import Callable
from typing import Any
from urllib.parse import quote

import aiohttp

from .const import API_BASE


# ヘッダーに入れる値は、表示可能なASCII(空白・改行なし)に限る(ヘッダーインジェクション対策)
_HEADER_SAFE = re.compile(r"^[\x21-\x7e]{1,512}$")


class RemoIrCloudError(Exception):
    """Base error."""


class RemoIrCloudAuthError(RemoIrCloudError):
    """Token is invalid or has been reset."""


class RemoIrCloudRateLimitError(RemoIrCloudError):
    """Rate limit exceeded (HTTP 429)."""


class RemoIrCloudConnectionError(RemoIrCloudError):
    """Network / timeout error."""


class RemoIrCloudClient:
    """Thin wrapper around the Nature Remo Cloud API."""

    def __init__(
        self, session: aiohttp.ClientSession, token_getter: Callable[[], str]
    ) -> None:
        self._session = session
        self._token_getter = token_getter
        self.rate_limit: dict[str, int] = {}

    def _update_rate_limit(self, headers: Any) -> None:
        mapping = {
            "limit": "x-rate-limit-limit",
            "remaining": "x-rate-limit-remaining",
            "reset": "x-rate-limit-reset",
        }
        found: dict[str, int] = {}
        for key, header in mapping.items():
            value = headers.get(header)
            if value is None:
                continue
            try:
                found[key] = int(float(value))
            except ValueError:
                continue
        if found:
            self.rate_limit = found

    async def _request(self, method: str, path: str) -> Any:
        token = self._token_getter()
        if not _HEADER_SAFE.match(token or ""):
            raise RemoIrCloudAuthError("invalid token format")
        headers = {
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        }
        try:
            async with self._session.request(
                method,
                f"{API_BASE}{path}",
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=15),
            ) as resp:
                self._update_rate_limit(resp.headers)
                if resp.status == 401:
                    raise RemoIrCloudAuthError("invalid token")
                if resp.status == 429:
                    raise RemoIrCloudRateLimitError("rate limit exceeded")
                if resp.status >= 400:
                    raise RemoIrCloudError(f"HTTP {resp.status}")
                try:
                    return await resp.json(content_type=None)
                except ValueError:
                    return None
        except (aiohttp.ClientError, asyncio.TimeoutError) as err:
            raise RemoIrCloudConnectionError(str(err)) from err

    async def validate(self) -> None:
        """Check that the token works (GET /1/users/me)."""
        await self._request("GET", "/1/users/me")

    async def get_appliances(self) -> list[dict[str, Any]]:
        """GET /1/appliances (each appliance carries its signals)."""
        data = await self._request("GET", "/1/appliances")
        return data if isinstance(data, list) else []

    async def send_signal(self, signal_id: str) -> None:
        """POST /1/signals/{id}/send."""
        await self._request("POST", f"/1/signals/{quote(signal_id, safe='')}/send")
