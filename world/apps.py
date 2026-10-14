# -*- coding: utf-8 -*-
"""Django 应用配置：注册 ``world`` 应用，并把后台里的显示名设成「世界工作区」。"""
from django.apps import AppConfig


class WorldConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "world"
    verbose_name = "世界工作区"
