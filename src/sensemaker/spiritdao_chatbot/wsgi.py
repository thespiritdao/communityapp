"""
WSGI configuration for PythonAnywhere
Place this file in /var/www/ on PythonAnywhere
Or copy contents to the WSGI configuration file in the Web tab
"""
import sys
import os

# Add your project directory to the sys.path
project_home = '/home/yourusername/spiritdao'  # CHANGE 'yourusername' to your actual username
if project_home not in sys.path:
    sys.path.insert(0, project_home)

# Load environment variables
from dotenv import load_dotenv
env_path = os.path.join(project_home, '.env')
load_dotenv(dotenv_path=env_path)

# Import Flask app
from app import app as application
