from src.converters.markdown_cleaner import clean_markdown


def test_markdown_cleaner_keeps_structure_and_removes_noise() -> None:
    markdown = "Book title\n# Chapitre\n\nPage 1\n\nTexte\nTexte\n\n\n\n## Suite\n- item"

    cleaned = clean_markdown(markdown)

    assert "# Chapitre" in cleaned
    assert "## Suite" in cleaned
    assert "Page 1" not in cleaned
    assert cleaned.count("Texte") == 1
