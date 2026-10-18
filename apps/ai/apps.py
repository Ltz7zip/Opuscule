# -*- coding: utf-8 -*-
"""Django 应用配置：注册 ``ai`` 应用。"""
from django.apps import AppConfig


class AiConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.ai"
    verbose_name = "AI 助手"
