"""
SIGN MANAGER — Add, remove, and list custom signs.

Usage:
  python manage_signs.py list                          # Show all signs
  python manage_signs.py add "Good Morning" "🌞"      # Add a new sign with emoji
  python manage_signs.py add "Help"                    # Add without emoji
  python manage_signs.py remove "Hello"                # Remove a sign + its data
  python manage_signs.py reset                         # Remove ALL signs and data
"""

import json
import os
import sys
import shutil

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")
DATA_RAW_DIR = os.path.join(BASE_DIR, "data_raw")
DATA_PROC_DIR = os.path.join(BASE_DIR, "data_processed")
CLASSES_PATH = os.path.join(BASE_DIR, "classes.json")


def load_config():
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return json.load(f)


def save_config(cfg):
    with open(CONFIG_PATH, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)


def list_signs(cfg):
    signs = cfg.get("signs", {})
    if not signs:
        print("\n  No signs configured. Add one with: python manage_signs.py add \"Hello\" \"👋\"\n")
        return
    print(f"\n  {'Sign':<20} {'Emoji':<8} {'Data File':<15} {'Frames'}")
    print("  " + "-" * 60)
    for name, info in sorted(signs.items()):
        emoji = info.get("emoji", "")
        data_file = os.path.join(DATA_RAW_DIR, f"data_{name}.jsonl")
        if os.path.exists(data_file):
            with open(data_file, encoding="utf-8") as f:
                count = sum(1 for _ in f)
            status = f"{count} frames"
        else:
            status = "NO DATA"
        print(f"  {name:<20} {emoji:<8} data_{name}.jsonl  {status}")
    print(f"\n  Total: {len(signs)} signs\n")


def add_sign(cfg, name, emoji=""):
    signs = cfg.setdefault("signs", {})
    if name in signs:
        print(f"\n  Sign \"{name}\" already exists. Use remove first if you want to re-add.\n")
        return False
    signs[name] = {"emoji": emoji}
    save_config(cfg)
    print(f"\n  ✓ Added sign: \"{name}\" {emoji}")
    print(f"  Next: python capture.py --label \"{name}\"")
    print(f"  Then: python train.py\n")
    return True


def remove_sign(cfg, name):
    signs = cfg.get("signs", {})
    if name not in signs:
        print(f"\n  Sign \"{name}\" not found. Available signs:")
        for s in sorted(signs.keys()):
            print(f"    - {s}")
        print()
        return False

    # Confirm
    emoji = signs[name].get("emoji", "")
    resp = input(f"  Remove \"{name}\" {emoji} and delete its data? (y/n): ").strip().lower()
    if resp != "y":
        print("  Cancelled.\n")
        return False

    del signs[name]
    save_config(cfg)

    # Delete data file
    data_file = os.path.join(DATA_RAW_DIR, f"data_{name}.jsonl")
    if os.path.exists(data_file):
        os.remove(data_file)
        print(f"  Deleted {data_file}")

    # Clean processed data (needs rebuild)
    for f in ["X.npy", "y.npy"]:
        p = os.path.join(DATA_PROC_DIR, f)
        if os.path.exists(p):
            os.remove(p)

    print(f"\n  ✓ Removed sign: \"{name}\"")
    print(f"  Run 'python train.py' to retrain without this sign.\n")
    return True


def reset_all(cfg):
    signs = cfg.get("signs", {})
    if not signs:
        print("\n  No signs to reset.\n")
        return

    resp = input(f"  Delete ALL {len(signs)} signs and their data? (y/n): ").strip().lower()
    if resp != "y":
        print("  Cancelled.\n")
        return

    cfg["signs"] = {}
    save_config(cfg)

    # Delete all data files
    if os.path.exists(DATA_RAW_DIR):
        for f in os.listdir(DATA_RAW_DIR):
            if f.endswith(".jsonl"):
                os.remove(os.path.join(DATA_RAW_DIR, f))

    # Delete processed data
    for f in ["X.npy", "y.npy"]:
        p = os.path.join(DATA_PROC_DIR, f)
        if os.path.exists(p):
            os.remove(p)

    if os.path.exists(CLASSES_PATH):
        os.remove(CLASSES_PATH)

    print("\n  ✓ All signs and data deleted.")
    print("  Start fresh: python manage_signs.py add \"Hello\" \"👋\"\n")


def interactive_add(cfg):
    """Interactive mode to add multiple signs quickly."""
    print("\n  === Add Signs (type 'done' to finish) ===\n")
    while True:
        name = input("  Sign name (or 'done'): ").strip()
        if name.lower() == "done" or not name:
            break
        emoji = input("  Emoji (optional, press Enter to skip): ").strip()
        add_sign(cfg, name, emoji)
        cfg = load_config()  # Reload after save
    print("  Done adding signs.\n")


def print_usage():
    print("""
  SignLang AI — Sign Manager
  ─────────────────────────────────────────
  Usage:
    python manage_signs.py list                        Show all signs
    python manage_signs.py add "Wave" "👋"             Add a sign
    python manage_signs.py add                         Interactive add mode
    python manage_signs.py remove "Wave"               Remove a sign
    python manage_signs.py reset                       Remove ALL signs
  ─────────────────────────────────────────
""")


if __name__ == "__main__":
    cfg = load_config()
    args = sys.argv[1:]

    if not args:
        print_usage()
        list_signs(cfg)
        sys.exit(0)

    cmd = args[0].lower()

    if cmd == "list":
        list_signs(cfg)

    elif cmd == "add":
        if len(args) >= 2:
            name = args[1]
            emoji = args[2] if len(args) >= 3 else ""
            add_sign(cfg, name, emoji)
        else:
            interactive_add(cfg)

    elif cmd == "remove":
        if len(args) >= 2:
            remove_sign(cfg, args[1])
        else:
            print("\n  Usage: python manage_signs.py remove \"SignName\"\n")

    elif cmd == "reset":
        reset_all(cfg)

    else:
        print_usage()
