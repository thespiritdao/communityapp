import os

def list_files_and_folders(directory):
    for root, dirs, files in os.walk(directory):
        level = root.replace(directory, '').count(os.sep)
        indent = ' ' * 4 * (level)
        print(f'{indent}{os.path.basename(root)}/')
        sub_indent = ' ' * 4 * (level + 1)
        for file in files:
            print(f'{sub_indent}{file}')

if __name__ == "__main__":
    directory = r"C:\Users\PC\Documents\DAO\App\commapp\src"
    list_files_and_folders(directory)
