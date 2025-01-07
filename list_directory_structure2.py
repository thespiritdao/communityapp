import os

def print_directory_tree(root_path, indent=""):
    """Recursively print the directory tree starting from root_path."""
    # Get a sorted list of entries to ensure consistent output order
    entries = sorted(os.listdir(root_path))
    for i, entry in enumerate(entries):
        path = os.path.join(root_path, entry)
        is_last = (i == len(entries) - 1)
        prefix = "└── " if is_last else "├── "
        print(indent + prefix + entry)
        if os.path.isdir(path):
            new_indent = indent + ("    " if is_last else "│   ")
            print_directory_tree(path, new_indent)

# Paths to print the directory trees for
path_chat = "C:\Users\PC\Documents\DAO\App\commapp\src\"


print("Directory tree for 'src\\identity':")
print_directory_tree(path_chat)
