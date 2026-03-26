"""
Simple workflow launcher for jars_project_onnx.

Keeps capture/train/server scripts separate, but gives one easy entry point.

Usage:
  python workflow.py
  python workflow.py menu
  python workflow.py capture --label Hello --frames 600 --hand-only
  python workflow.py train --algorithm mlp
  python workflow.py full-hand-only --frames 600 --algorithm mlp
"""

import argparse
import subprocess
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def run_step(args):
    cmd = [sys.executable] + args
    print("\n[run]", " ".join(cmd))
    result = subprocess.run(cmd, cwd=BASE_DIR)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def cmd_capture(args):
    cmd = ["capture.py"]
    if args.label:
        cmd += ["--label", args.label]
    if args.all:
        cmd += ["--all"]
    if args.frames:
        cmd += ["--frames", str(args.frames)]
    if args.hand_only:
        cmd += ["--hand-only"]
    if args.skip:
        cmd += ["--skip"] + args.skip
    run_step(cmd)


def cmd_train(args):
    cmd = ["train.py"]
    if args.algorithm:
        cmd += ["--algorithm", args.algorithm]
    if args.epochs:
        cmd += ["--epochs", str(args.epochs)]
    if args.no_augment:
        cmd += ["--no-augment"]
    elif args.augment is not None:
        cmd += ["--augment", str(args.augment)]
    run_step(cmd)


def cmd_server(_args):
    run_step(["server.py"])


def cmd_check(_args):
    run_step(["check_input.py"])


def cmd_full_hand_only(args):
    capture_cmd = ["capture.py", "--all", "--hand-only"]
    if args.frames:
        capture_cmd += ["--frames", str(args.frames)]
    if args.skip:
        capture_cmd += ["--skip"] + args.skip
    run_step(capture_cmd)

    train_cmd = ["train.py"]
    if args.algorithm:
        train_cmd += ["--algorithm", args.algorithm]
    run_step(train_cmd)

    run_step(["check_input.py"])


def cmd_menu(_args):
    while True:
        print("\n=== Sign Workflow Menu ===")
        print("1) Capture one sign")
        print("2) Capture all signs (hand-only)")
        print("3) Train model")
        print("4) Full hand-only pipeline (capture all -> train -> check)")
        print("5) Run inference server")
        print("6) Exit")
        choice = input("Select option: ").strip()

        if choice == "1":
            label = input("Label name: ").strip()
            frames = input("Frames (default 800): ").strip() or "800"
            mode = input("Hand-only mode? (y/n, default y): ").strip().lower() or "y"
            cmd = ["capture.py", "--label", label, "--frames", frames]
            if mode == "y":
                cmd.append("--hand-only")
            run_step(cmd)
        elif choice == "2":
            frames = input("Frames per sign (default 600): ").strip() or "600"
            run_step(["capture.py", "--all", "--frames", frames, "--hand-only"])
        elif choice == "3":
            algo = input("Algorithm (mlp/deep_mlp/cnn1d, default mlp): ").strip() or "mlp"
            run_step(["train.py", "--algorithm", algo])
        elif choice == "4":
            frames = input("Frames per sign (default 600): ").strip() or "600"
            algo = input("Algorithm (default mlp): ").strip() or "mlp"
            run_step(["capture.py", "--all", "--frames", frames, "--hand-only"])
            run_step(["train.py", "--algorithm", algo])
            run_step(["check_input.py"])
        elif choice == "5":
            run_step(["server.py"])
        elif choice == "6":
            print("Bye.")
            return
        else:
            print("Invalid option. Try again.")


def build_parser():
    parser = argparse.ArgumentParser(description="Simple workflow launcher")
    sub = parser.add_subparsers(dest="command")

    p_capture = sub.add_parser("capture", help="Run capture.py")
    p_capture.add_argument("--label", type=str)
    p_capture.add_argument("--all", action="store_true")
    p_capture.add_argument("--frames", type=int)
    p_capture.add_argument("--hand-only", action="store_true")
    p_capture.add_argument("--skip", nargs="*", default=[])
    p_capture.set_defaults(func=cmd_capture)

    p_train = sub.add_parser("train", help="Run train.py")
    p_train.add_argument("--algorithm", type=str)
    p_train.add_argument("--epochs", type=int)
    p_train.add_argument("--augment", type=int)
    p_train.add_argument("--no-augment", action="store_true")
    p_train.set_defaults(func=cmd_train)

    p_server = sub.add_parser("server", help="Run server.py")
    p_server.set_defaults(func=cmd_server)

    p_check = sub.add_parser("check", help="Run check_input.py")
    p_check.set_defaults(func=cmd_check)

    p_full = sub.add_parser(
        "full-hand-only",
        help="Capture all signs in hand-only mode, then train and check",
    )
    p_full.add_argument("--frames", type=int)
    p_full.add_argument("--algorithm", type=str, default="mlp")
    p_full.add_argument("--skip", nargs="*", default=[])
    p_full.set_defaults(func=cmd_full_hand_only)

    p_menu = sub.add_parser("menu", help="Interactive menu")
    p_menu.set_defaults(func=cmd_menu)

    return parser


def main():
    parser = build_parser()
    args = parser.parse_args()

    # Default behavior: open menu for simplest usage.
    if not args.command:
      cmd_menu(args)
      return

    args.func(args)


if __name__ == "__main__":
    main()
