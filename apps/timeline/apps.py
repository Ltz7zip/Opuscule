"""timeline 应用的配置类（Django 启动时据此登记这个 app）。"""

from django.apps import AppConfig


class TimelineConfig(AppConfig):
    name = 'apps.timeline'
