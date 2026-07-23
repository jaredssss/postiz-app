"""
AI Video Factory - Script Generator
Converts history facts into video scripts of 3 lengths: 8s, 30s, 60s
Uses template-based generation (no LLM API required)
"""
import re
import logging
from datetime import datetime

logger = logging.getLogger(__name__)


def extract_year_and_event(fact):
    """Extract the year and event description from a fact string."""
    # Try patterns like "1969 – Neil Armstrong..." or "In 1969, ..."
    patterns = [
        r'^(\d{3,4})\s*[\u2013\u2014\-\u2012]+\s*(.+)$',  # "1969 – Event"
        r'^In\s+(\d{3,4})[,:]?\s*(.+)$',                    # "In 1969, Event"
        r'^(\d{3,4})[.:]\s*(.+)$',                           # "1969. Event"
        r'.*?(\d{3,4})\s*[\u2013\u2014\-\u2012]+\s*(.+)$',  # fallback with year
    ]

    for pattern in patterns:
        match = re.match(pattern, fact, re.IGNORECASE)
        if match:
            year = match.group(1)
            event = match.group(2).strip()
            return year, event

    # If no year found, return None for year and the full fact
    return None, fact


def truncate_to_words(text, max_words):
    """Truncate text to a maximum number of words, ending at a sentence if possible."""
    words = text.split()
    if len(words) <= max_words:
        return text

    truncated = " ".join(words[:max_words])
    # Try to end at a sentence boundary
    last_period = truncated.rfind(".")
    if last_period > len(truncated) * 0.6:
        return truncated[:last_period + 1]
    return truncated + "..."


def generate_8s_script(fact):
    """
    Generate an 8-second script (~20 words).
    Format: Quick hook + core fact
    """
    year, event = extract_year_and_event(fact)
    today = datetime.now()

    if year:
        # Calculate how many years ago
        try:
            years_ago = today.year - int(year)
            hook = f"On this day, {years_ago} years ago:"
        except ValueError:
            hook = "On this day in history:"

        # Keep the event very short
        short_event = truncate_to_words(event, 12)
        script = f"{hook} {short_event}"
    else:
        script = f"Today in history: {truncate_to_words(fact, 15)}"

    # Ensure it's around 20 words
    words = script.split()
    if len(words) > 22:
        script = " ".join(words[:20]) + "..."

    return script


def generate_30s_script(fact):
    """
    Generate a 30-second script (~75 words).
    Format: Hook + Context + Fact + CTA
    """
    year, event = extract_year_and_event(fact)
    today = datetime.now()
    date_str = today.strftime("%B %d")

    if year:
        try:
            years_ago = today.year - int(year)
            hook = f"Did you know what happened on {date_str}, {years_ago} years ago?"
        except ValueError:
            hook = f"Here's an incredible moment from {date_str} in history."

        # Build the body with context
        event_text = truncate_to_words(event, 45)
        body = f"In {year}, {event_text}"

        # Add significance
        significance = generate_significance(event)
    else:
        hook = f"Here's a fascinating fact about {date_str}."
        body = truncate_to_words(fact, 50)
        significance = "This moment changed the course of history forever."

    cta = "Follow for more daily history facts!"

    script = f"{hook} {body} {significance} {cta}"

    # Trim to ~75 words
    words = script.split()
    if len(words) > 80:
        script = " ".join(words[:75]) + f"... {cta}"

    return script


def generate_60s_script(fact):
    """
    Generate a 60-second script (~150 words).
    Format: Hook + Background + Detailed Fact + Impact + CTA
    """
    year, event = extract_year_and_event(fact)
    today = datetime.now()
    date_str = today.strftime("%B %d")

    if year:
        try:
            years_ago = today.year - int(year)
            era = get_era_context(int(year))
            hook = (
                f"Stop scrolling! On this day, {date_str}, exactly {years_ago} years ago, "
                f"something remarkable happened that you probably didn't learn in school."
            )
        except ValueError:
            era = ""
            hook = (
                f"Stop scrolling! Today's date, {date_str}, marks one of history's "
                f"most fascinating moments."
            )

        # Background context
        background = f"It was {year}. {era}" if era else f"The year was {year}."

        # Main event
        event_text = truncate_to_words(event, 70)
        main_body = f"{event_text}"

        # Impact and reflection
        impact = generate_impact(event, year)

    else:
        hook = (
            f"Stop scrolling! Today's date, {date_str}, holds a secret from history "
            f"that will blow your mind."
        )
        background = "Throughout the centuries, this day has witnessed incredible events."
        main_body = truncate_to_words(fact, 80)
        impact = "This event shaped the world we live in today in ways we often take for granted."

    cta = (
        "If you learned something new, hit follow for daily history facts "
        "that will make you the smartest person in the room!"
    )

    script = f"{hook} {background} {main_body} {impact} {cta}"

    # Trim to ~150 words
    words = script.split()
    if len(words) > 160:
        # Cut body but keep hook and CTA
        script = " ".join(words[:145]) + f"... {cta}"

    return script


def generate_significance(event):
    """Generate a significance statement based on event keywords."""
    event_lower = event.lower()

    if any(w in event_lower for w in ["war", "battle", "military", "army"]):
        return "This moment altered the balance of power in the world."
    elif any(w in event_lower for w in ["discover", "invent", "science", "research"]):
        return "This discovery would change science forever."
    elif any(w in event_lower for w in ["born", "death", "died"]):
        return "Their legacy continues to influence us today."
    elif any(w in event_lower for w in ["first", "record", "breakthrough"]):
        return "This was a first that opened doors for generations to come."
    elif any(w in event_lower for w in ["treaty", "peace", "agreement", "signed"]):
        return "This agreement reshaped international relations."
    elif any(w in event_lower for w in ["launch", "space", "moon", "nasa"]):
        return "This achievement pushed humanity closer to the stars."
    else:
        return "This event left a lasting mark on history."


def generate_impact(event, year):
    """Generate an impact statement for 60s scripts."""
    event_lower = event.lower()

    try:
        years_since = datetime.now().year - int(year)
    except (ValueError, TypeError):
        years_since = None

    time_phrase = f"Over {years_since} years later" if years_since else "To this day"

    if any(w in event_lower for w in ["war", "battle", "military"]):
        return (
            f"{time_phrase}, historians still debate the full consequences of this moment. "
            f"It reshaped borders, ended dynasties, and changed millions of lives."
        )
    elif any(w in event_lower for w in ["discover", "invent", "science"]):
        return (
            f"{time_phrase}, we still benefit from this breakthrough every single day. "
            f"It laid the foundation for technologies we now take for granted."
        )
    elif any(w in event_lower for w in ["president", "king", "queen", "leader"]):
        return (
            f"{time_phrase}, the ripple effects of this political moment are still felt. "
            f"It set precedents that continue to shape governance worldwide."
        )
    elif any(w in event_lower for w in ["launch", "space", "moon"]):
        return (
            f"{time_phrase}, this achievement remains one of humanity's proudest moments. "
            f"It proved that when we work together, nothing is impossible."
        )
    else:
        return (
            f"{time_phrase}, this event's impact continues to resonate. "
            f"It reminds us that single moments can change everything."
        )


def get_era_context(year):
    """Provide brief era context for a given year."""
    if year < 500:
        return "The ancient world was at a crossroads of empires and civilizations."
    elif year < 1000:
        return "The medieval world was shaped by faith, conquest, and survival."
    elif year < 1500:
        return "The world was on the brink of the Age of Exploration."
    elif year < 1700:
        return "Europe was being transformed by revolution and enlightenment."
    elif year < 1800:
        return "The world was entering an age of revolution and independence."
    elif year < 1900:
        return "The industrial age was transforming every aspect of life."
    elif year < 1950:
        return "The world was navigating two devastating world wars."
    elif year < 1970:
        return "The Cold War era was reshaping global politics and culture."
    elif year < 2000:
        return "Technology was beginning to connect the world in unprecedented ways."
    else:
        return "The digital age was just beginning to reveal its potential."


def generate_scripts(fact):
    """
    Generate all 3 script versions for a single fact.
    Returns dict with keys: '8s', '30s', '60s'
    """
    return {
        "8s": generate_8s_script(fact),
        "30s": generate_30s_script(fact),
        "60s": generate_60s_script(fact),
    }


def generate_all_scripts(facts):
    """
    Generate scripts for all facts.
    Returns list of dicts, each with 'fact' and 'scripts' keys.
    """
    results = []
    for fact in facts:
        scripts = generate_scripts(fact)
        results.append({
            "fact": fact,
            "scripts": scripts,
        })
        logger.info(f"Generated scripts for: {fact[:50]}...")

    return results


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    # Test with sample facts
    test_facts = [
        "1969 \u2013 Neil Armstrong becomes the first person to walk on the Moon during the Apollo 11 mission.",
        "1776 \u2013 The United States Declaration of Independence is adopted by the Second Continental Congress.",
        "1945 \u2013 The United Nations Charter is signed by 50 nations in San Francisco.",
    ]

    for fact in test_facts:
        print(f"\n{'='*60}")
        print(f"FACT: {fact}")
        print(f"{'='*60}")
        scripts = generate_scripts(fact)
        for length, script in scripts.items():
            word_count = len(script.split())
            print(f"\n[{length}] ({word_count} words):")
            print(f"  {script}")
