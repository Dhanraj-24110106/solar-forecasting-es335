"""Build the clean winter dataset from the raw monthly plant exports.

Input : Data/Raw/Winter/{Power,Weather,ModuleTemp}/<Month>.csv
Output: Data/Clean/Winter_Clean.csv  (15 Oct 2025 - 14 Feb 2026, 15-min blocks)

Fixes applied (see Data/DATA_SOURCES.md):
  1. 27 Nov 2025, 07:45-16:30: every column is copied/shifted data in the raw
     export. Each block is replaced by the mean of the same block on 26 Nov and
     28 Nov (neighbour-day average).
  2. 14 Jan 2026, 13:45-16:30: power stuck at ~12.80 MW while GHI falls. Weather
     is fine, so power is re-estimated with a linear regression of power on GHI
     and module temperature, fitted on the 7 days before (daytime blocks only)
     and capped at the day's own observed peak.
  3. Night GHI reads 1.12 W/m2 (one sensor step) when power is zero; set to 0.
Wind direction is kept as-is and possible output caps are left in.

Run from the project root:  python src/build_clean_winter.py
"""

from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "Data" / "Raw" / "Winter"
OUT = ROOT / "Data" / "Clean" / "Winter_Clean.csv"

START, END = "2025-10-15 00:00", "2026-02-14 23:45"

POWER = "Act. Power (MW)"
GHI = "W-GHI (W/m2)"
MODT = "W-MODT- (°C)"
AMBT = "W-AMBT (°C)"
WDIR = "W-WDIR- (Degree)"
WSPD = "W-WSPD (m/s)"
VALUE_COLS = [POWER, GHI, MODT, AMBT, WDIR, WSPD]


def read_folder(folder):
    frames = []
    for f in sorted(folder.glob("*.csv")):
        d = pd.read_csv(f, encoding="utf-8-sig")
        d["TimeStamp"] = pd.to_datetime(d["TimeStamp"], format="%m/%d/%y %H:%M")
        frames.append(d)
    return pd.concat(frames, ignore_index=True)


def load_raw():
    df = (
        read_folder(RAW / "Power")
        .merge(read_folder(RAW / "Weather"), on="TimeStamp", how="outer")
        .merge(read_folder(RAW / "ModuleTemp"), on="TimeStamp", how="outer")
        .sort_values("TimeStamp")
    )
    df = df[(df["TimeStamp"] >= START) & (df["TimeStamp"] <= END)].reset_index(drop=True)

    expected = pd.date_range(START, END, freq="15min")
    assert len(df) == len(expected) and (df["TimeStamp"].values == expected.values).all(), "missing or extra timestamps"
    assert not df[VALUE_COLS].isna().any().any(), "empty cells in raw data"
    return df.set_index("TimeStamp")[VALUE_COLS]


def window(df, day, start, end):
    """Index of the 15-min blocks of `day` between `start` and `end` (inclusive)."""
    idx = df.index
    return idx[(idx >= f"{day} {start}") & (idx <= f"{day} {end}")]


def fix_copied_day(df):
    """27 Nov: replace the copied 07:45-16:30 blocks with the 26/28 Nov average."""
    bad = window(df, "2025-11-27", "07:45", "16:30")
    prev_day = df.loc[bad - pd.Timedelta(days=1), VALUE_COLS].to_numpy()
    next_day = df.loc[bad + pd.Timedelta(days=1), VALUE_COLS].to_numpy()
    df.loc[bad, VALUE_COLS] = (prev_day + next_day) / 2
    return bad


def fix_frozen_power(df):
    """14 Jan: re-estimate the stuck power from GHI and module temperature."""
    bad = window(df, "2026-01-14", "13:45", "16:30")

    hist = df.loc["2026-01-07 00:00":"2026-01-13 23:45"]
    hist = hist[hist[GHI] > 20]
    model = LinearRegression().fit(hist[[GHI, MODT]], hist[POWER])
    print(f"14 Jan power model: R^2 = {model.score(hist[[GHI, MODT]], hist[POWER]):.3f} on {len(hist)} blocks")

    # The plant levels off around midday (12-16 Jan peak at 16-17 MW whatever the
    # GHI), which a straight line can't capture, so cap at this day's own peak.
    day_peak = df.loc["2026-01-14", POWER].drop(bad).max()
    pred = model.predict(df.loc[bad, [GHI, MODT]])
    df.loc[bad, POWER] = np.clip(pred, 0, day_peak).round(2)
    return bad


def fix_night_ghi(df):
    """Night GHI sits at one sensor step (1.12 W/m2); set it to 0 when power is 0."""
    night = (df[GHI] > 0) & (df[GHI] <= 1.125) & (df[POWER] == 0)
    df.loc[night, GHI] = 0.0
    return night.sum()


def main():
    df = load_raw()

    copied = fix_copied_day(df)
    frozen = fix_frozen_power(df)
    n_night = fix_night_ghi(df)

    out = df.round({POWER: 2, GHI: 2, MODT: 1, AMBT: 1, WDIR: 3, WSPD: 5})
    out.insert(0, "Block", out.index.hour * 4 + out.index.minute // 15 + 1)
    out.insert(0, "Date", out.index.date)
    out = out.reset_index()

    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(OUT, index=False)

    print(f"27 Nov copied blocks replaced : {len(copied)}")
    print(f"14 Jan frozen blocks replaced : {len(frozen)}")
    print(f"Night GHI values set to 0     : {n_night}")
    print(f"Wrote {len(out)} rows ({out['Date'].nunique()} days) to {OUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
