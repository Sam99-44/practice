def summarize(completed, first_try_correct):
    """Summarize a session; no permanent learner records are stored yet."""
    return {"completed": completed, "first_try_correct": first_try_correct,
            "accuracy": round(100 * first_try_correct / completed) if completed else 0}