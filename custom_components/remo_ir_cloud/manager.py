"""Core logic of Remo IR Cloud."""
from __future__ import annotations

import logging
import re
from collections.abc import Awaitable, Callable
from typing import Any, TypeVar

from homeassistant.components import persistent_notification
from homeassistant.core import HomeAssistant
from homeassistant.helpers.aiohttp_client import async_get_clientsession
from homeassistant.util import dt as dt_util

from . import references
from .api import (
    RemoIrCloudAuthError,
    RemoIrCloudClient,
    RemoIrCloudConnectionError,
    RemoIrCloudError,
    RemoIrCloudRateLimitError,
)
from .button import ButtonHub
from .const import DOMAIN, ICON_RE, SIGNAL_ID_RE, SLUG_PREFIX, SLUG_RE
from .errors import ManagerError
from .ledger import Ledger

_LOGGER = logging.getLogger(__name__)
T = TypeVar("T")

NOTIFICATION_ID = f"{DOMAIN}_auth"

_CTRL = re.compile(r"[\x00-\x1f\x7f]")
_TOKEN_RE = re.compile(r"^[\x21-\x7e]{8,512}$")
MAX_SIGNALS = 2000


def _text(value: Any, limit: int = 100) -> str | None:
    """クラウドから受け取った文字列は、制御文字を除き、長さを制限して保存する。"""
    if value is None:
        return None
    return _CTRL.sub("", str(value)).strip()[:limit]



def signal_label(meta: dict[str, Any]) -> str:
    """'Remo名 / 家電名 / 信号名' 形式のラベル."""
    parts = [meta.get("remo"), meta.get("appliance"), meta.get("signal")]
    return " / ".join(p for p in parts if p) or meta.get("signal_id", "?")


class RemoIrCloudManager:
    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self.ledger = Ledger(hass)
        self.session = async_get_clientsession(hass)
        self.client = RemoIrCloudClient(self.session, lambda: self.ledger.token)
        self.hub = ButtonHub(hass, self.press_button, self.device_for)
        self.auth_failed = False

    # ---- デバイス(ボタンを、家電ごとにまとめる) -----------------------------------
    def _group_of(self, signal_id: str) -> dict[str, Any] | None:
        """信号が属する家電(取得結果から)。取得結果に信号がなければ None。"""
        meta = self._sig_map().get(signal_id)
        if meta is None:
            return None
        return {
            "id": meta["appliance_id"],
            "name": meta.get("appliance"),
            "type": meta.get("appliance_type"),
        }

    def device_for(self, item: dict[str, Any]) -> dict[str, Any]:
        group = item["group"]
        return {
            "identifiers": {(DOMAIN, f"appliance_{group['id']}")},
            "name": group.get("name") or "Nature Remo",
            "manufacturer": "Nature",
            "model": group.get("type") or "Nature Remo",
        }

    def _sync_groups(self) -> None:
        """取得結果に合わせて、ボタンの家電(デバイス)名などを更新する。"""
        for key, b in list(self.ledger.buttons.items()):
            group = self._group_of(b["signal_id"])
            if group is not None and group != b["group"]:
                item = {**b, "group": group}
                self.ledger.set_button(key, item)
                self.hub.update(key, item)

    async def async_setup(self) -> None:
        await self.ledger.async_load()

    # ------------------------------------------------------------ cloud access

    def _set_auth_failed(self, failed: bool) -> None:
        if failed == self.auth_failed:
            return
        self.auth_failed = failed
        if failed:
            persistent_notification.async_create(
                self.hass,
                "Nature Remoのアクセストークンが無効です(リセットされた可能性があります)。"
                "サイドバーの「Remo IR Cloud」→「設定」から、新しいトークンを入力してください。",
                title="Remo IR Cloud: トークンが無効です",
                notification_id=NOTIFICATION_ID,
            )
        else:
            persistent_notification.async_dismiss(self.hass, NOTIFICATION_ID)

    async def _cloud(self, call: Callable[[], Awaitable[T]]) -> T:
        """クラウドAPI呼び出しの共通処理(エラーを利用者向けメッセージに変換)。"""
        if not self.ledger.token:
            raise ManagerError("アクセストークンが未設定です。「設定」から入力してください")
        try:
            result = await call()
        except RemoIrCloudAuthError as err:
            self._set_auth_failed(True)
            raise ManagerError(
                "トークンが無効です(リセットされた可能性があります)。"
                "「設定」から新しいトークンを入力してください",
                502,
            ) from err
        except RemoIrCloudRateLimitError as err:
            raise ManagerError(
                "クラウドAPIのレート制限に達しました。しばらく待ってからやり直してください", 502
            ) from err
        except RemoIrCloudConnectionError as err:
            raise ManagerError(f"Nature Remoクラウドに接続できません: {err}", 502) from err
        except RemoIrCloudError as err:
            raise ManagerError(f"クラウドAPIでエラーが発生しました: {err}", 502) from err
        self._set_auth_failed(False)
        return result

    async def send(self, signal_id: str) -> None:
        if not SIGNAL_ID_RE.match(signal_id or ""):
            raise ManagerError("信号IDが不正です")
        await self._cloud(lambda: self.client.send_signal(signal_id))

    async def update_token(self, token: str) -> None:
        token = (token or "").strip()
        if not token:
            raise ManagerError("アクセストークンを入力してください")
        if not _TOKEN_RE.match(token):
            raise ManagerError("トークンの形式が不正です(空白を含まない半角の英数字・記号、8〜512文字)")
        probe = RemoIrCloudClient(self.session, lambda: token)
        try:
            await probe.validate()
        except RemoIrCloudAuthError as err:
            raise ManagerError("トークンが無効です。入力を確認してください", 400) from err
        except RemoIrCloudRateLimitError as err:
            raise ManagerError("APIのレート制限に達しています。しばらく待ってください", 502) from err
        except RemoIrCloudError as err:
            raise ManagerError(f"クラウドに接続できません: {err}", 502) from err
        self.ledger.set_token(token)
        self._set_auth_failed(False)

    # ------------------------------------------------------------ fetch (明示操作)

    def status(self) -> dict[str, Any]:
        cache = self.ledger.cache
        return {
            "configured": bool(self.ledger.token),
            "auth_failed": self.auth_failed,
            "fetched_at": cache.get("fetched_at"),
            "count": len(cache.get("signals") or []),
            "rate_limit": cache.get("rate_limit") or {},
        }

    async def fetch(self) -> dict[str, Any]:
        """クラウドから家電・信号を取得する。パネルの「情報を取得」を押したときだけ呼ばれる。"""
        appliances = await self._cloud(lambda: self.client.get_appliances())
        signals: list[dict[str, Any]] = []
        for appliance in appliances:
            for sig in appliance.get("signals") or []:
                sid = str(sig.get("id") or "")
                if not SIGNAL_ID_RE.match(sid) or len(signals) >= MAX_SIGNALS:
                    continue
                app_id = str(appliance.get("id") or "")
                if not SIGNAL_ID_RE.match(app_id):
                    continue
                signals.append(
                    {
                        "signal_id": sid,
                        "signal": _text(sig.get("name")),
                        "appliance": _text(appliance.get("nickname")),
                        "appliance_id": app_id,
                        "appliance_type": _text(appliance.get("type"), 40),
                        "remo": _text((appliance.get("device") or {}).get("name")),
                    }
                )
        self.ledger.set_cache(
            {
                "fetched_at": dt_util.utcnow().isoformat(),
                "signals": signals,
                "rate_limit": dict(self.client.rate_limit),
            }
        )
        self._sync_groups()
        return self.status()

    def _sig_map(self) -> dict[str, dict[str, Any]]:
        return {s["signal_id"]: s for s in self.ledger.cache.get("signals") or []}

    # ------------------------------------------------------------------ signals

    def _eid(self, key: str) -> str:
        return self.hub.entity_id(key) or f"button.{key}"

    async def list_signals(self) -> list[dict[str, Any]]:
        sigs = self._sig_map()
        mine = {b["signal_id"]: (k, b) for k, b in self.ledger.buttons.items()}
        out = []
        for sid, meta in sigs.items():
            entry = mine.get(sid)
            out.append(
                {
                    "signal_id": sid,
                    "label": signal_label(meta),
                    "appliance": meta.get("appliance") or "",
                    "signal": meta.get("signal") or "",
                    "button": (
                        {"key": entry[0], "entity_id": self._eid(entry[0]), "alias": entry[1]["alias"]}
                        if entry
                        else None
                    ),
                }
            )
        return out

    async def test_send(self, signal_id: str) -> None:
        if signal_id not in self._sig_map():
            raise ManagerError("信号が一覧にありません。「情報を取得」を押してください", 404)
        await self.send(signal_id)

    # ------------------------------------------------------------------ buttons

    async def list_buttons(self) -> list[dict[str, Any]]:
        sigs = self._sig_map()
        out = []
        for key, b in self.ledger.buttons.items():
            meta = sigs.get(b["signal_id"])
            out.append(
                {
                    "key": key,
                    "entity_id": self._eid(key),
                    "area_id": self.hub.area_of(key),
                    "alias": b["alias"],
                    "icon": b.get("icon") or "",
                    "signal_id": b["signal_id"],
                    "label": signal_label(meta) if meta else None,
                }
            )
        return out

    @staticmethod
    def _check_fields(alias: str, icon: str) -> tuple[str, str]:
        alias = _CTRL.sub("", alias or "").strip()
        icon = (icon or "").strip()
        if not alias or len(alias) > 80:
            raise ManagerError("アクション名称を入力してください(80文字以内)")
        if icon and not ICON_RE.match(icon):
            raise ManagerError("アイコンの形式が不正です(例 mdi:television)")
        return alias, icon

    def _check_area(self, area_id: str | None) -> str | None:
        """None=変更しない / 空文字=解除 / ID=そのエリア(存在を確認)。"""
        if area_id is None:
            return None
        area_id = area_id.strip()
        if area_id and not self.hub.area_exists(area_id):
            raise ManagerError("エリアが見つかりません", status=404)
        return area_id

    async def add_button(
        self, signal_id: str, slug: str, alias: str, icon: str, area_id: str | None = None
    ) -> dict[str, Any]:
        alias, icon = self._check_fields(alias, icon)
        area_id = self._check_area(area_id)
        if not SLUG_RE.match(slug or ""):
            raise ManagerError("IDは小文字英数字とアンダースコアで入力してください(40文字以内)")
        if signal_id not in self._sig_map():
            raise ManagerError("信号が一覧にありません。「情報を取得」を押してください", 404)
        key = f"{SLUG_PREFIX}{slug}"
        if key in self.ledger.buttons or self.hub.is_taken(key):
            raise ManagerError(f"button.{key} は既に使われています", status=409)
        for k, b in self.ledger.buttons.items():
            if b["signal_id"] == signal_id:
                raise ManagerError(
                    f"同じ信号が {self._eid(k)} として登録済みです",
                    status=409,
                    extra={"match": {"key": k, "entity_id": self._eid(k)}},
                )
        item = {
            "alias": alias,
            "icon": icon,
            "signal_id": signal_id,
            "group": self._group_of(signal_id),
        }
        self.ledger.set_button(key, item)
        self.hub.add(key, item)
        if area_id:
            self.hub.set_area(key, area_id)
        return {"key": key, "entity_id": self._eid(key)}

    async def update_button(
        self, key: str, alias: str, icon: str, signal_id: str, area_id: str | None = None
    ) -> dict[str, Any]:
        alias, icon = self._check_fields(alias, icon)
        area_id = self._check_area(area_id)
        current = self.ledger.buttons.get(key)
        if current is None:
            raise ManagerError(f"button.{key} が見つかりません", status=404)
        if not SIGNAL_ID_RE.match(signal_id or ""):
            raise ManagerError("信号IDが不正です")
        if signal_id != current["signal_id"]:
            if signal_id not in self._sig_map():
                raise ManagerError("信号が一覧にありません。「情報を取得」を押してください", 404)
            for k, b in self.ledger.buttons.items():
                if k != key and b["signal_id"] == signal_id:
                    raise ManagerError(
                        f"同じ信号が {self._eid(k)} として登録済みです", status=409
                    )
        group = (
            self._group_of(signal_id)
            if signal_id != current["signal_id"]
            else current["group"]
        )
        item = {"alias": alias, "icon": icon, "signal_id": signal_id, "group": group}
        self.ledger.set_button(key, item)
        self.hub.update(key, item)
        if area_id is not None:
            self.hub.set_area(key, area_id)
        return {"key": key, "entity_id": self._eid(key)}

    async def delete_button(self, key: str) -> dict[str, Any]:
        if key not in self.ledger.buttons:
            raise ManagerError(f"button.{key} が見つかりません", status=404)
        result = self.hub.remove(key)
        self.ledger.del_button(key)
        return {"ok": True, "entity": result}

    async def button_references(self, key: str) -> list[dict[str, Any]]:
        entity_id = self._eid(key)
        return await self.hass.async_add_executor_job(
            references.search_references, self.hass.config.config_dir, entity_id
        )

    async def press_button(self, key: str) -> None:
        b = self.ledger.buttons.get(key)
        if b is None:
            raise ManagerError("ボタンが見つかりません", status=404)
        await self.send(b["signal_id"])
