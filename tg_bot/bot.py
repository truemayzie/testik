import asyncio
import logging
import os
import socket

# Установите в .env TELEGRAM_HTTP_PROXY (например http://127.0.0.1:8118), если до api.telegram.org нет прямого доступа — иначе aiogram «зависает» на CONNECT.

from aiogram import Bot, Dispatcher, F
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.filters import CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import (
    CallbackQuery,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    KeyboardButton,
    Message,
    ReplyKeyboardMarkup,
    ReplyKeyboardRemove,
)
from dotenv import load_dotenv

load_dotenv()

BOT_TOKEN = os.getenv("BOT_TOKEN")
ADMIN_ID = int(os.getenv("ADMIN_ID", "615693569"))
SITE_URL = os.getenv("SITE_URL", "https://ref-ai.ru")

logging.basicConfig(level=logging.INFO)

TG_PROXY = (
    os.getenv("TELEGRAM_HTTP_PROXY", "").strip()
    or os.getenv("HTTPS_PROXY", "").strip()
    or os.getenv("ALL_PROXY", "").strip()
    or ""
)
_kwargs: dict = {"timeout": 120}
if TG_PROXY:
    _kwargs["proxy"] = TG_PROXY
_bot_session = AiohttpSession(**_kwargs)
if not TG_PROXY:
    _bot_session._connector_init["family"] = socket.AF_INET
bot = Bot(token=BOT_TOKEN, session=_bot_session)
dp = Dispatcher(storage=MemoryStorage())


# ── Состояния ──────────────────────────────────────────────────────
class AskQuestion(StatesGroup):
    waiting_for_question = State()


# ── Клавиатуры ─────────────────────────────────────────────────────
def main_menu() -> ReplyKeyboardMarkup:
    return ReplyKeyboardMarkup(
        keyboard=[
            [KeyboardButton(text="✍️ Задать вопрос")],
            [KeyboardButton(text="❓ FAQ")],
            [KeyboardButton(text="🌐 Перейти на сайт")],
        ],
        resize_keyboard=True,
    )


def faq_keyboard() -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="Как скачать работу?", callback_data="faq_download")],
            [InlineKeyboardButton(text="Платёж прошёл, но работа не сгенерировалась", callback_data="faq_payment")],
            [InlineKeyboardButton(text="Сколько времени занимает генерация?", callback_data="faq_time")],
            [InlineKeyboardButton(text="Какие форматы на выходе?", callback_data="faq_formats")],
            [InlineKeyboardButton(text="⬅️ Назад", callback_data="faq_back")],
        ]
    )


FAQ_ANSWERS = {
    "faq_download": "После генерации нажмите кнопку «Скачать DOCX» под результатом.",
    "faq_payment": "Вернитесь на сайт — работа должна появиться автоматически. Если нет, напишите нам через «✍️ Задать вопрос».",
    "faq_time": "Реферат ~3 мин, Курсовая ~5 мин, ВКР ~7 мин.",
    "faq_formats": "DOCX по ГОСТ + опционально PPTX-презентация и текст выступления.",
}


def user_mention(message: Message) -> str:
    user = message.from_user
    name = user.full_name or "Без имени"
    username = f"@{user.username}" if user.username else "нет username"
    return f"{name} ({username}, id: {user.id})"


# ── Хэндлеры ───────────────────────────────────────────────────────
@dp.message(CommandStart())
async def cmd_start(message: Message, state: FSMContext):
    await state.clear()
    await message.answer(
        "Привет! Это поддержка Refai 👋 Чем могу помочь?",
        reply_markup=main_menu(),
    )


@dp.message(F.text == "✍️ Задать вопрос")
async def ask_question(message: Message, state: FSMContext):
    await state.set_state(AskQuestion.waiting_for_question)
    await message.answer(
        "Напишите ваш вопрос — я передам его команде Refai:",
        reply_markup=ReplyKeyboardRemove(),
    )


@dp.message(AskQuestion.waiting_for_question)
async def receive_question(message: Message, state: FSMContext):
    await state.clear()

    mention = user_mention(message)
    admin_text = (
        f"📩 Новый вопрос от пользователя\n"
        f"👤 {mention}\n\n"
        f"💬 {message.text}"
    )
    await bot.send_message(ADMIN_ID, admin_text)

    await message.answer(
        "Ваш вопрос отправлен! Мы ответим в ближайшее время.",
        reply_markup=main_menu(),
    )


@dp.message(F.text == "❓ FAQ")
async def show_faq(message: Message, state: FSMContext):
    await state.clear()
    await message.answer("Выберите вопрос:", reply_markup=faq_keyboard())


@dp.message(F.text == "🌐 Перейти на сайт")
async def go_to_site(message: Message, state: FSMContext):
    await state.clear()
    url = (SITE_URL or "https://ref-ai.ru").strip()
    if not url.startswith(("http://", "https://")):
        url = f"https://{url}"
    kb = InlineKeyboardMarkup(
        inline_keyboard=[[InlineKeyboardButton(text="Открыть Refai", url=url)]]
    )
    # Дублируем URL текстом: кнопка с url не показывает адрес в чате — так ссылка всегда видна и копируется.
    await message.answer(
        f"Переходите на сайт:\n{url}",
        reply_markup=kb,
        disable_web_page_preview=True,
    )


# ── FAQ callbacks ───────────────────────────────────────────────────
@dp.callback_query(F.data.in_(FAQ_ANSWERS.keys()))
async def faq_answer(callback: CallbackQuery):
    await callback.answer()
    await callback.message.answer(FAQ_ANSWERS[callback.data], reply_markup=main_menu())


@dp.callback_query(F.data == "faq_back")
async def faq_back(callback: CallbackQuery):
    await callback.answer()
    await callback.message.answer("Главное меню:", reply_markup=main_menu())


# ── Ответ админа пользователю ───────────────────────────────────────
@dp.message(F.chat.id == ADMIN_ID, F.reply_to_message)
async def admin_reply(message: Message):
    # Ищем id пользователя в тексте исходного сообщения (формат "id: 123456789")
    original = message.reply_to_message.text or ""
    user_id = None
    for part in original.split():
        if part.startswith("id:"):
            try:
                user_id = int(part[3:].rstrip(")"))
            except ValueError:
                pass
        # Формат "id: 123456789)" — пробел между id: и числом
        if user_id is None and "id:" in original:
            try:
                idx = original.index("id:") + 3
                num = ""
                for ch in original[idx:].strip():
                    if ch.isdigit():
                        num += ch
                    else:
                        break
                if num:
                    user_id = int(num)
            except Exception:
                pass
        if user_id:
            break

    if not user_id:
        await message.reply("Не удалось определить ID пользователя из сообщения.")
        return

    try:
        await bot.send_message(
            user_id,
            f"💬 Ответ поддержки Refai:\n\n{message.text}",
            reply_markup=main_menu(),
        )
        await message.reply(f"Ответ отправлен пользователю {user_id} ✓")
    except Exception as e:
        await message.reply(f"Не удалось отправить: {e}")


# ── Запуск ──────────────────────────────────────────────────────────
async def main():
    await dp.start_polling(bot)


if __name__ == "__main__":
    asyncio.run(main())
