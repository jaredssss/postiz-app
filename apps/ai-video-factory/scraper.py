"""
AI Video Factory - History Facts Scraper
Scrapes daily history facts from Wikipedia "On This Day" and onthisday.com
"""
import requests
from bs4 import BeautifulSoup
from datetime import datetime
import logging
import random

logger = logging.getLogger(__name__)


def scrape_wikipedia_on_this_day():
    """Scrape history facts from Wikipedia's 'On this day' page."""
    facts = []
    today = datetime.now()
    month = today.strftime("%B")
    day = today.day

    url = f"https://en.wikipedia.org/wiki/{month}_{day}"
    headers = {
        "User-Agent": "AIVideoFactory/1.0 (Educational content bot; contact: admin@example.com)"
    }

    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "lxml")

        # Find the Events section
        events_heading = None
        for heading in soup.find_all(["h2", "h3"]):
            span = heading.find("span", {"id": "Events"})
            if span:
                events_heading = heading
                break

        if events_heading:
            # Get the <ul> list after the Events heading
            next_element = events_heading.find_next_sibling()
            while next_element and next_element.name != "ul":
                next_element = next_element.find_next_sibling()

            if next_element and next_element.name == "ul":
                items = next_element.find_all("li", recursive=False)
                for item in items:
                    text = item.get_text(strip=True)
                    if text and len(text) > 20:
                        # Clean up the text
                        text = text.replace("\xa0", " ").strip()
                        facts.append(text)

        logger.info(f"Scraped {len(facts)} facts from Wikipedia for {month} {day}")

    except Exception as e:
        logger.error(f"Error scraping Wikipedia: {e}")

    return facts


def scrape_onthisday():
    """Scrape history facts from onthisday.com as a fallback source."""
    facts = []
    today = datetime.now()
    month = today.strftime("%B").lower()
    day = today.day

    url = f"https://www.onthisday.com/day/{month}/{day}"
    headers = {
        "User-Agent": "AIVideoFactory/1.0 (Educational content bot)"
    }

    try:
        response = requests.get(url, headers=headers, timeout=15)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "lxml")

        # Find event list items
        event_sections = soup.find_all("li", class_="event")
        if not event_sections:
            # Try alternative selectors
            event_sections = soup.find_all("li", class_="event--list__item")

        for item in event_sections:
            text = item.get_text(strip=True)
            if text and len(text) > 20:
                facts.append(text)

        logger.info(f"Scraped {len(facts)} facts from onthisday.com")

    except Exception as e:
        logger.error(f"Error scraping onthisday.com: {e}")

    return facts


def get_daily_facts(min_facts=4):
    """
    Get today's history facts from multiple sources.
    Returns at least min_facts interesting historical events.
    """
    all_facts = []

    # Try Wikipedia first (primary source)
    wiki_facts = scrape_wikipedia_on_this_day()
    all_facts.extend(wiki_facts)

    # If not enough facts, try onthisday.com
    if len(all_facts) < min_facts:
        otd_facts = scrape_onthisday()
        all_facts.extend(otd_facts)

    # Remove duplicates while preserving order
    seen = set()
    unique_facts = []
    for fact in all_facts:
        normalized = fact.lower().strip()
        if normalized not in seen:
            seen.add(normalized)
            unique_facts.append(fact)

    # Filter for quality - prefer facts with years and decent length
    quality_facts = [
        f for f in unique_facts
        if any(str(year) in f for year in range(100, 2100))
        and 30 < len(f) < 500
    ]

    # If we have quality facts, use those; otherwise use all
    selected = quality_facts if len(quality_facts) >= min_facts else unique_facts

    # Shuffle and return the requested number
    random.shuffle(selected)
    result = selected[:max(min_facts, 12)]  # Get up to 12 for variety

    if len(result) < min_facts:
        logger.warning(
            f"Only found {len(result)} facts (needed {min_facts}). "
            "Using fallback facts."
        )
        result.extend(get_fallback_facts(min_facts - len(result)))

    logger.info(f"Returning {len(result)} daily facts")
    return result


def get_fallback_facts(count):
    """Provide fallback facts if scraping fails."""
    today = datetime.now()
    fallbacks = [
        f"On this day in history, {today.strftime('%B %d')}, many remarkable events shaped our world. From scientific breakthroughs to cultural milestones, this date has witnessed humanity's greatest moments.",
        f"Throughout history, {today.strftime('%B %d')} has been a day of transformation. Great leaders made decisions, inventors changed technology, and artists created masterpieces.",
        f"History remembers {today.strftime('%B %d')} as a day when the course of civilization shifted. Wars ended, treaties were signed, and new nations were born.",
        f"On {today.strftime('%B %d')}, throughout the centuries, humanity achieved remarkable feats. From the first flights to space exploration, this day marks progress.",
    ]
    return fallbacks[:count]


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    facts = get_daily_facts()
    print(f"\n{'='*60}")
    print(f"Daily History Facts ({datetime.now().strftime('%B %d, %Y')})")
    print(f"{'='*60}")
    for i, fact in enumerate(facts, 1):
        print(f"\n{i}. {fact}")
