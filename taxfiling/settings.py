from datetime import timedelta
import os
from pathlib import Path

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent

# GeoDjango (PostGIS backend) requires native GDAL/GEOS DLLs on Windows.
# If you installed OSGeo4W/QGIS somewhere else (a common "wrong install path"
# issue), update these two paths to point at the actual DLLs on your machine.
GEOS_LIBRARY_PATH = r"D:\osgeo4w\bin\geos_c.dll"
GDAL_LIBRARY_PATH = r"D:\osgeo4w\bin\gdal312.dll"
OSGEO4W_BIN = r"D:\osgeo4w\bin"
OSGEO4W_PROJ = r"D:\osgeo4w\share\proj"
OSGEO4W_GDAL = r"D:\osgeo4w\share\gdal"

# Force GeoDjango/GDAL to use OSGeo4W data files (avoid old PostGIS PROJ db).
os.environ["PROJ_LIB"] = OSGEO4W_PROJ
os.environ["PROJ_DATA"] = OSGEO4W_PROJ
os.environ["GDAL_DATA"] = OSGEO4W_GDAL
if OSGEO4W_BIN not in os.environ.get("PATH", ""):
    os.environ["PATH"] = OSGEO4W_BIN + os.pathsep + os.environ.get("PATH", "")


# Quick-start development settings - unsuitable for production
# See https://docs.djangoproject.com/en/6.0/howto/deployment/checklist/

# SECURITY WARNING: keep the secret key used in production secret!
SECRET_KEY = 'django-insecure-@8w#6o0$dnn6llpr%jufkeeq0rtt=lc*7_-6^t+r=7imxi1y^q'

# SECURITY WARNING: don't run with debug turned on in production!
DEBUG = True

ALLOWED_HOSTS = []


# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt.token_blacklist',
    'maps.apps.MapsConfig',
    "django.contrib.gis",
    'corsheaders',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_CREDENTIALS = True

# ── Django REST Framework ──────────────────────────────────────────────────
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=30),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'AUTH_HEADER_TYPES': ('Bearer',),
}

ROOT_URLCONF = 'taxfiling.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'taxfiling.wsgi.application'


# Database
# https://docs.djangoproject.com/en/6.0/ref/settings/#databases

# Explicit environment-driven DB config.
# Defaults below are only for local development.
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_NAME = os.getenv("DB_NAME", "taxfiling")
DB_USER = os.getenv("DB_USER", "taxuser")
DB_PORT = os.getenv("DB_PORT", "5433")
DB_PASSWORD = os.getenv("DB_PASSWORD")

if not DB_PASSWORD:
    if DEBUG:
        DB_PASSWORD = "pops1245"
    else:
        raise RuntimeError("DB_PASSWORD is required when DEBUG=False")

DATABASES = {
    "default": {
        "ENGINE": "django.contrib.gis.db.backends.postgis",
        "NAME": DB_NAME,
        "USER": DB_USER,
        "PASSWORD": DB_PASSWORD,
        "HOST": DB_HOST,
        "PORT": DB_PORT,
    }
}



# Password validation
# https://docs.djangoproject.com/en/6.0/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/6.0/topics/i18n/

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'UTC'

USE_I18N = True

USE_TZ = True


# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/6.0/howto/static-files/

STATIC_URL = 'static/'

STATICFILES_DIRS = [
    BASE_DIR / 'maps/static'
]

# Email settings
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
