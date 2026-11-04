"""Model definitions and mapping from Gemini frontend JS source."""

# MODE_CATEGORY enum from 028-6eb337387583.js:
#   1=FAST, 2=THINKING, 3=PRO, 4=AUTO, 5=FAST_DYNAMIC_THINKING, 6=FLASH_LITE

MODELS = {
    "gemini-3.7-flash": {
        "mode": 1, "think": 4,
        "desc": "Latest all-around model (Gemini 3.7 Flash)",
    },
    "gemini-3.6-flash": {
        "mode": 1, "think": 4,
        "desc": "All-around model (Gemini 3.6 Flash)",
    },
    "gemini-3.5-flash": {
        "mode": 1, "think": 4,
        "desc": "Alias for gemini-3.6-flash (backend upgraded)",
    },
    "gemini-3.5-flash-thinking": {
        "mode": 2, "think": 0,
        "desc": "Deep thinking mode, longest output (~20k chars)",
    },
    "gemini-3.1-pro": {
        "mode": 3, "think": 4,
        "desc": "Pro model (requires cookie for real routing)",
    },
    "gemini-3.1-pro-enhanced": {
        "mode": 3, "think": 4, "extra": {31: 2, 80: 3},
        "desc": "Pro with enhanced output (experimental)",
    },
    "gemini-auto": {
        "mode": 4, "think": 4,
        "desc": "Auto model selection",
    },
    "gemini-3.5-flash-thinking-lite": {
        "mode": 5, "think": 0,
        "desc": "Dynamic thinking with adaptive depth",
    },
    "gemini-flash-lite": {
        "mode": 6, "think": 4,
        "desc": "Lightweight fast model",
    },
    "gemini-2.5-flash": {
        "mode": 1, "think": 4,
        "desc": "Gemini 2.5 Flash alias",
    },
    "gemini-2.5-pro": {
        "mode": 3, "think": 4,
        "desc": "Gemini 2.5 Pro alias",
    },
    "gemini-2.0-flash": {
        "mode": 1, "think": 4,
        "desc": "Gemini 2.0 Flash alias",
    },
    "gemini-1.5-flash": {
        "mode": 1, "think": 4,
        "desc": "Gemini 1.5 Flash alias",
    },
    "gemini-1.5-pro": {
        "mode": 3, "think": 4,
        "desc": "Gemini 1.5 Pro alias",
    },
    "gemini-flash": {
        "mode": 1, "think": 4,
        "desc": "Fast model alias",
    },
    "gemini-pro": {
        "mode": 3, "think": 4,
        "desc": "Pro model alias",
    },
    "gemini-thinking": {
        "mode": 2, "think": 0,
        "desc": "Thinking mode alias",
    },
}


def resolve_model(model_name: str, default: str = "gemini-3.7-flash"):
    """Resolve model name to (name, mode_id, think_mode, error, extra_fields).

    Dynamically maps any incoming model name to the most suitable active backend mode.
    """
    think_override = None
    if "@think=" in model_name:
        model_name, think_str = model_name.rsplit("@think=", 1)
        try:
            think_override = int(think_str)
        except ValueError:
            return None, None, None, f"Invalid think level: {think_str}", None
    cfg = MODELS.get(model_name)
    if not cfg:
        from .gemini import log
        lower = model_name.lower()
        if "pro" in lower:
            mode_id, think_default = 3, 4
        elif "think" in lower:
            mode_id, think_default = 2, 0
        elif "lite" in lower:
            mode_id, think_default = 6, 4
        else:
            mode_id, think_default = 1, 4
        log(f"Dynamic auto-mapping for model '{model_name}' -> mode={mode_id}, think={think_default}")
        think_mode = think_override if think_override is not None else think_default
        return model_name, mode_id, think_mode, None, None

    mode_id = cfg["mode"]
    think_mode = think_override if think_override is not None else cfg["think"]
    extra = cfg.get("extra")
    return model_name, mode_id, think_mode, None, extra
