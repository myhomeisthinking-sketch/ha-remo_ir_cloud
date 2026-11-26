"""Constants for Remo IR Cloud."""
from __future__ import annotations

import re

DOMAIN = "remo_ir_cloud"

API_BASE = "https://api.nature.global"

SLUG_RE = re.compile(r"^[a-z0-9_]{1,40}$")
ICON_RE = re.compile(r"^[a-z0-9_-]+:[a-z0-9_-]+$")
SIGNAL_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

SLUG_PREFIX = "remocloud_"


PANEL_URL = "remo-ir-cloud"
STATIC_URL = "/remo_ir_cloud_static"
PANEL_VERSION = "1.0.0"

STORAGE_KEY = DOMAIN

STORAGE_VERSION = 1
