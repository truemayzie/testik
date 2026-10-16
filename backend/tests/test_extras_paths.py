from __future__ import annotations

import os
from jobstore import get_extras_dir, extras_file_path


def test_extras_dir_exists():
    d = get_extras_dir()
    assert os.path.isdir(d)


def test_extras_file_path_generation():
    p = extras_file_path("test_sample.docx")
    assert p.endswith("test_sample.docx")
    assert os.path.dirname(p) == get_extras_dir()
