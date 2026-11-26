"""Persistent storage (.storage/remo_ir_cloud): access token and fetched-signal cache."""
from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import STORAGE_KEY, STORAGE_VERSION


class Ledger:
    """token: str / cache: {"fetched_at", "signals": [...], "rate_limit": {...}}
    buttons: {key: {"alias": str, "icon": str, "signal_id": str}}  ← ボタンエンティティの定義"""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store = Store(hass, STORAGE_VERSION, STORAGE_KEY, private=True, atomic_writes=True)
        self.token: str = ""
        self.cache: dict[str, Any] = {}
        self.buttons: dict[str, dict[str, Any]] = {}

    async def async_load(self) -> None:
        data = await self._store.async_load() or {}
        self.token = data.get("token") or ""
        self.cache = data.get("cache") or {}
        self.buttons = data.get("buttons") or {}

    def _save(self) -> None:
        self._store.async_delay_save(
            lambda: {"token": self.token, "cache": self.cache, "buttons": self.buttons}, 1
        )

    def set_token(self, token: str) -> None:
        self.token = token
        self._save()

    def set_cache(self, cache: dict[str, Any]) -> None:
        self.cache = cache
        self._save()

    def set_button(self, key: str, item: dict[str, Any]) -> None:
        self.buttons[key] = item
        self._save()

    def del_button(self, key: str) -> None:
        self.buttons.pop(key, None)
        self._save()
