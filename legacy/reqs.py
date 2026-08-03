badge = "genealogy"
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
styles['Normal'].fontName = 'DejaVuSans'
styles['Normal'].spaceAfter = 2  # Reduced spacing after paragraphs

styles['Title'].fontName = 'DejaVuSans'

trans_gray = colors.HexColor("#80808080")

# Create a custom style for the sub-requirements (indented)
sub_item_style = ParagraphStyle(
    'SubItem',
    parent=styles['Normal'],
    leftIndent=0.15 * inch,  # Indent sub-requirements
    spaceAfter=4  # Reduced spacing between subitems
)
sub_subitem_style = ParagraphStyle(
    'SubSubItem',
    parent=styles['Normal'],
    leftIndent=0.3 * inch,  # Indent sub-requirements
    spaceAfter=4  # Reduced spacing between subitems
)

margin = 0.5 * inch
margins = margin * 2

doc = SimpleDocTemplate(
    badge_mod.file_name(),
    pagesize=letter,
    leftMargin=margin, rightMargin=margin,
    topMargin=margin, bottomMargin=margin
)

def add_image_from_local_file(c, file_path, x, y, width=None, height=None):
    # Check if the file exists
    try:
        # Set the transparency if needed
        c.setFillAlpha(0.1)
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
    fontSize=40,             # Set the desired font size
    leading=50,              # Adjust line spacing for readability
    textColor=colors.black   # Text color (optional)
)

# mb
mb_path = badge_mod.image_file()
mb_img = Image(mb_path, width=1.5*inch, height=1.5*inch)

# Add the text
text = Paragraph( badge_mod.name(), large_text_style)

# Create a table to hold the image and text
table_data = [[mb_img, text]]
table = Table(table_data, colWidths=[
    (width - margins) * 0.25, 
    (width - margins) * 0.75])
table.setStyle( TableStyle([
    ('ALIGN', (0, 0), (1, 0), 'LEFT'),
    ('VALIGN', (0, 0), (1, 0), 'CENTER')  
]) )

# Add the table to the story
story.append(table)
story.append(Spacer(1, 20))  # Add space after the table

#
#   scout info
#

scoutData = [
    [   Paragraph("&nbsp;", styles['Normal']),
        Paragraph("&nbsp;", styles['Normal']),
        Paragraph("&nbsp;", styles['Normal']),
        Paragraph("&nbsp;", styles['Normal']),
        Paragraph("&nbsp;", styles['Normal'])
    ],
    [   Paragraph("Scout Name", styles['Normal']),
        Paragraph("&nbsp;", styles['Normal']),
        Paragraph("Scout Unit # and Town", styles['Normal']),
        Paragraph("&nbsp;", styles['Normal']),
        Paragraph("Date", styles['Normal'])
    ],
]

scoutTable = Table(
    scoutData, 
    colWidths=[
        (width - margins) * .3, 
        (width - margins) * .05,
        (width - margins) * .3, 
        (width - margins) * .05,
        (width - margins) * .3,
    ],
    style=[
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LINEABOVE', (0, 1), (0, 1), 1, 'black'),
        ('LINEABOVE', (2, 1), (2, 1), 1, 'black'),
        ('LINEABOVE', (4, 1), (4, 1), 1, 'black'),
        # ('BACKGROUND', (0, 0), (100, 100), colors.pink)
    ]
)

story.append( scoutTable )
story.append(Spacer(1, 20))

# Create a function to add numbered requirements with space for initials
colWidths = [(width - margins) * 0.9, (width - margins) * 0.1]

tableStyleParams = []
tableStyleParams.append(('ALIGN', (1, 0), (1, 0), 'RIGHT')) 
tableStyleParams.append(('BOTTOMPADDING', (0, 0), (-1, -1), 4))
tableStyleParams.append(('LINEBELOW', (0, 0), (1, 0), 0.25, trans_gray))
# tableStyleParams.append(('BACKGROUND', (0, 0), (100, 100), colors.orange))

tableStyleSignParams = tableStyleParams[:]
tableStyleSignParams.append(('LINEBELOW', (1, 0), (1, 0), 1, colors.black))

def add_requirement(text, subitems=None, sub_subitems=None):
    # Add main requirement with a line for initials on the right
    data = [[Paragraph(text, styles['Normal']), Paragraph('', styles['Normal'])]]
    table = Table(data, colWidths=colWidths)
    if subitems or sub_subitems:
        table.setStyle(TableStyle(tableStyleParams))
    else:
        table.setStyle(TableStyle(tableStyleSignParams))
    story.append(table)
    
    # Add subitems (if any) with space for initials and proper indentation
    if subitems:
        for subitem in subitems:
            if isinstance(subitem, dict):
                # If the subitem is a dictionary, it has nested subitems
                for key, value in subitem.items():
                    # Add subitem (e.g., "a. Birds")
                    data = [[Paragraph(key, sub_item_style), Paragraph('', styles['Normal'])]]
                    table = Table(data, colWidths=colWidths)
                    table.setStyle(TableStyle(tableStyleParams))
                    story.append(table)
                    
                    # Add nested sub-subitems (e.g., "(1) In the field, identify eight species of birds.")
                    for sub_subitem in value:
                        data = [[Paragraph(sub_subitem, sub_subitem_style), Paragraph('', styles['Normal'])]]
                        table = Table(data, colWidths=colWidths)
                        table.setStyle(TableStyle(tableStyleSignParams))
                        story.append(table)
            else:
                # Regular subitem (no further nesting)
                data = [[Paragraph(subitem, sub_item_style), Paragraph('', styles['Normal'])]]
                table = Table(data, colWidths=colWidths)
                table.setStyle(TableStyle(tableStyleSignParams))
                story.append(table)
    story.append(Spacer(1, 2))  # Reduced spacing after each requirement

###
###
###


reqs = badge_mod.requirements()
for req in reqs:
    add_requirement(*req)

###
###
###

story.append(Spacer(1, 20))

chk_path = "checkbox.png"
chk = Image(chk_path, width=0.25*inch, height=0.25*inch)

mbCompleteData = [
    [chk, Paragraph("Merit Badge Complete", styles['Normal']),
     chk, Paragraph('Merit Badge Partial', styles['Normal'])],
]
mbCompleteTable = Table(mbCompleteData, colWidths=[
    (width - margins) * 0.05, 
    (width - margins) * 0.45,
    (width - margins) * 0.05,
    (width - margins) * 0.45]
)
mbCompleteStyleParams = []
mbCompleteStyleParams.append(('ALIGN', (0, 0), (1, 1), 'LEFT')) 
mbCompleteStyleParams.append(('VALIGN', (0, 0), (1, 1), 'CENTER')) 
mbCompleteTable.setStyle(TableStyle(mbCompleteStyleParams))
story.append(mbCompleteTable)

story.append(Spacer(1, 20))


counselorData = [
    [   Paragraph("&nbsp;", styles['Normal']),
        Paragraph("&nbsp;", styles['Normal']),
        Paragraph("&nbsp;", styles['Normal']),
        Paragraph("&nbsp;", styles['Normal']),
        Paragraph("&nbsp;", styles['Normal'])
    ],
    [   Paragraph("Counselor Signature", styles['Normal']),
        Paragraph("&nbsp;", styles['Normal']),
        Paragraph("Counselor Name", styles['Normal']),
        Paragraph("&nbsp;", styles['Normal']),
        Paragraph("Counselor Contact", styles['Normal'])
    ],
]

counselorTable = Table(
    counselorData, 
    colWidths=[
        (width - margins) * .3, 
        (width - margins) * .05,
        (width - margins) * .3, 
        (width - margins) * .05,
        (width - margins) * .3
    ],
    style=[
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LINEABOVE', (0, 1), (0, 1), 1, 'black'),
        ('LINEABOVE', (2, 1), (2, 1), 1, 'black'),
        ('LINEABOVE', (4, 1), (4, 1), 1, 'black'),
    ]
)

story.append( counselorTable )





image_x = width - 300 - 1 * inch  # Adjust based on image width and margin
image_y = 30  # Adjust based on your layout
image_url = 'aa-logo.jpeg'

# Build the PDF with a canvas callback
def on_page(canvas, doc):
    add_image_from_local_file(canvas, image_url, image_x, image_y, width=300, height=265)

# Build the PDF
doc.build(story, onFirstPage=on_page, onLaterPages=on_page)
