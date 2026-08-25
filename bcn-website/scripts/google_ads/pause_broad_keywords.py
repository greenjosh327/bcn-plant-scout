import sys

from bcn_native_seeds_campaign import main


if __name__ == "__main__":
    raise SystemExit(main(["pause-broad", *sys.argv[1:]]))
