from src.converters.token_counter import count_tokens, split_markdown_by_tokens


def test_count_tokens_returns_positive_value() -> None:
    assert count_tokens("hello world") > 0


def test_split_markdown_by_tokens_chunks_long_content() -> None:
    text = "\n\n".join(f"# Section {index}\n\n" + ("word " * 80) for index in range(6))

    chunks = split_markdown_by_tokens(text, max_tokens=80)

    assert len(chunks) > 1
    assert chunks[0].index == 0
