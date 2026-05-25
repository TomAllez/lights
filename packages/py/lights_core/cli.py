import argparse


def base_arg_parser() -> argparse.ArgumentParser:
    """Return an ArgumentParser pre-populated with the common lights IPC arguments."""
    parser = argparse.ArgumentParser()
    parser.add_argument('--width', type=int, default=640)
    parser.add_argument('--height', type=int, default=480)
    parser.add_argument('--min-detection-confidence', type=float, default=0.5)
    parser.add_argument('--min-tracking-confidence', type=float, default=0.5)
    return parser
