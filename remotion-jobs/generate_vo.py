"""Generate voiceover for the McDonald Rivet JOBS ad using Hume TTS API."""

import requests
import base64
import subprocess
import os
import re
import wave

HUME_API_KEY = "rcSOJ3Qn87ANsYzlCo9nWpcv7nhvkqC7xj03J6jXKGgMaGPm"
HUME_TTS_URL = "https://api.hume.ai/v0/tts"
VOICE_ID = "1c6b3c7a-a276-44e1-8773-997545f44f61"

SCRIPT = (
    "Mid-Michigan was built by people who work with their hands — "
    "in manufacturing, healthcare, and farming. "
    "But good-paying jobs are harder to find, and working families "
    "deserve someone fighting to bring them back. "
    "Congresswoman Kristen McDonald Rivet is leading the fight to protect "
    "Michigan manufacturers and create new jobs — "
    "so working families can stay, not be forced to leave. "
    "Thank you, Congresswoman McDonald Rivet, for standing up "
    "for Mid-Michigan's working families. "
    "Call Congresswoman McDonald Rivet's office today to tell her to keep going."
)

DIRECTION = (
    "Inspired and warm female narrator. Measured pace — about 2.4 words per second. "
    "Earnest and grounded, not somber or hype. "
    "Pride and warmth on the opening line about people who work with their hands. "
    "Slight urgency on 'good-paying jobs are harder to find.' "
    "Warmth and gratitude on the 'thank you' line. "
    "Clear and direct on the call-to-action."
)

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "public", "audio")


def trim_silences(wav_path, keep=0.15):
    result = subprocess.run(
        ["ffmpeg", "-i", wav_path, "-af", "silencedetect=noise=-30dB:d=0.2", "-f", "null", "-"],
        capture_output=True, text=True
    )
    silences = []
    for line in result.stderr.split("\n"):
        if "silence_start" in line:
            match = re.search(r"silence_start:\s*([\d.]+)", line)
            if match:
                silences.append({"start": float(match.group(1))})
        elif "silence_end" in line and silences:
            match = re.search(r"silence_end:\s*([\d.]+)", line)
            if match:
                silences[-1]["end"] = float(match.group(1))

    if not silences:
        return

    with wave.open(wav_path, "rb") as w:
        params = w.getparams()
        frames = w.readframes(w.getnframes())
        sr = w.getframerate()
        nc = w.getnchannels()
        sw = w.getsampwidth()

    bps = sr * nc * sw
    frame_size = nc * sw
    total_dur = len(frames) / bps

    segments = []
    prev_end = 0.0
    for s in silences:
        if "end" not in s:
            continue
        segments.append((prev_end, s["start"] + keep))
        prev_end = s["end"]
    segments.append((prev_end, total_dur))

    out_frames = bytearray()
    for start, end in segments:
        s_byte = (int(start * bps) // frame_size) * frame_size
        e_byte = (int(end * bps) // frame_size) * frame_size
        out_frames.extend(frames[s_byte:e_byte])

    with wave.open(wav_path, "wb") as w:
        w.setparams(params)
        w.writeframes(bytes(out_frames))

    new_dur = len(out_frames) / bps
    print(f"Trimmed silences: {total_dur:.1f}s -> {new_dur:.1f}s")


def generate():
    print(f"Generating Jobs VO...")

    resp = requests.post(
        HUME_TTS_URL,
        headers={"X-Hume-Api-Key": HUME_API_KEY, "Content-Type": "application/json"},
        json={
            "utterances": [{"text": SCRIPT, "description": DIRECTION, "voice": {"id": VOICE_ID}, "speed": 1.0}],
            "format": {"type": "mp3"}, "version": "1", "num_generations": 1,
        },
    )

    if resp.status_code != 200:
        print(f"Error {resp.status_code}: {resp.text}")
        return

    audio_bytes = base64.b64decode(resp.json()["generations"][0]["audio"])
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    mp3_path = os.path.join(OUTPUT_DIR, "vo_raw.mp3")
    wav_path = os.path.join(OUTPUT_DIR, "vo.wav")

    with open(mp3_path, "wb") as f:
        f.write(audio_bytes)

    subprocess.run(["ffmpeg", "-y", "-i", mp3_path, "-ar", "44100", "-ac", "2", wav_path], check=True, capture_output=True)

    dur = float(subprocess.run(["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", wav_path], capture_output=True, text=True).stdout.strip())
    print(f"Raw duration: {dur:.1f}s")

    if dur > 29:
        trim_silences(wav_path)
        dur = float(subprocess.run(["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", wav_path], capture_output=True, text=True).stdout.strip())

    print(f"Final: {dur:.1f}s | WPS: {len(SCRIPT.split()) / dur:.2f}")


if __name__ == "__main__":
    generate()
