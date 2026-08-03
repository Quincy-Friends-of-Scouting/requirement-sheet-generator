badge = "soil-water-conserve"
import importlib
badge_mod = importlib.import_module( badge )

from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.units import inch
from reportlab.lib import colors

# Register a font that supports more Unicode characters
pdfmetrics.registerFont(TTFont('DejaVuSans', 'DejaVuSans.ttf'))  # Make sure the font file is available

# Get the default styles and modify for custom needs
styles = getSampleStyleSheet()

styles['Title'].fontName = 'DejaVuSans'
styles['Title'].spaceBefore = 30

margin = 0.5 * inch
margins = margin * 2

doc = SimpleDocTemplate(
    badge_mod.sign_file_name(),
    pagesize=letter,
    leftMargin=margin, rightMargin=margin,
    topMargin=margin, bottomMargin=margin
)

def add_image_from_local_file(c, file_path, x, y, width=None, height=None):
    # Check if the file exists
    try:
        # Set the transparency if needed
        c.setFillAlpha(0.3)
        # Draw the image on the canvas from the local file path
        c.drawImage(file_path, x, y, width=width, height=height)
        c.setFillAlpha(1)
    except FileNotFoundError:
        print(f"Failed to load image: {file_path} not found")


width, height = letter
story = []

# Set up styles
styles = getSampleStyleSheet()
large_text_style = ParagraphStyle(
    name="ExtraLargeText",
    parent=styles['Title'],  # You can base it on 'Title' if you want similar features
    fontSize=70,             # Set the desired font size
    leading=70,              # Adjust line spacing for readability
    textColor=colors.black   # Text color (optional)
)

# mb
mb_path = badge_mod.image_file()
mb_img = Image(mb_path, width=5.25*inch, height=5.25*inch)

# Add the text
text = Paragraph(badge_mod.sign_name(), large_text_style)
spacer = Spacer(width=1, height=20)

table_data = [[text], [spacer], [mb_img]]
table = Table(table_data, colWidths=[
    (width - margins) * 1,
    (width - margins) * 1, 
    (width - margins) * 1])
table.setStyle( TableStyle([
    ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ('VALIGN', (0, 0), (-1, -1), 'CENTER')  
]) )

# Add the table to the story
story.append(table)

300/265

image_x = width - (300*0.75) - 0.5 * inch  # Adjust based on image width and margin
image_y = 30  # Adjust based on your layout
image_url = 'PTCLogo.png'

# Build the PDF with a canvas callback
def on_page(canvas, doc):
    add_image_from_local_file(canvas, image_url, image_x, image_y, width=(300*0.75), height=(265*0.75))

# Build the PDF
doc.build(story, onFirstPage=on_page)
