from src.extractors.pdf_analyzer import PdfComplexity, choose_engine_order


def test_choose_text_for_simple_extractable_pdf() -> None:
    profile = PdfComplexity(
        page_count=20,
        sampled_pages=4,
        extracted_chars=5000,
        avg_chars_per_page=1250,
        image_count=0,
        table_hint_count=0,
        formula_hint_count=0,
        scanned_likely=False,
        complexity="low",
        reasons=["texte extractible simple"],
    )

    assert choose_engine_order(profile, {"mineru": True, "marker": True, "text": True}) == [
        "text",
        "mineru",
        "marker",
    ]


def test_choose_mineru_for_complex_pdf() -> None:
    profile = PdfComplexity(
        page_count=240,
        sampled_pages=8,
        extracted_chars=8000,
        avg_chars_per_page=1000,
        image_count=12,
        table_hint_count=15,
        formula_hint_count=4,
        scanned_likely=False,
        complexity="high",
        reasons=["document long", "nombreuses images détectées"],
    )

    assert choose_engine_order(profile, {"mineru": True, "marker": True, "text": True}) == [
        "mineru",
        "marker",
        "text",
    ]


def test_choose_available_fallback_when_mineru_missing() -> None:
    profile = PdfComplexity(
        page_count=10,
        sampled_pages=4,
        extracted_chars=100,
        avg_chars_per_page=25,
        image_count=4,
        table_hint_count=0,
        formula_hint_count=0,
        scanned_likely=True,
        complexity="high",
        reasons=["PDF probablement scanné ou très visuel"],
    )

    assert choose_engine_order(profile, {"mineru": False, "marker": True, "text": True}) == [
        "marker",
        "text",
    ]
