/**
 * Regla de validación que limita la profundidad de las operaciones. Protege al
 * servidor de consultas abusivas del tipo
 * laboratory { medications { laboratory { medications { ... } } } }.
 */
import {
  GraphQLError,
  Kind,
  type ASTVisitor,
  type FragmentDefinitionNode,
  type SelectionSetNode,
  type ValidationContext,
} from 'graphql';

export function depthLimit(maxDepth: number) {
  return (context: ValidationContext): ASTVisitor => {
    const fragments = new Map<string, FragmentDefinitionNode>();
    for (const definition of context.getDocument().definitions) {
      if (definition.kind === Kind.FRAGMENT_DEFINITION) fragments.set(definition.name.value, definition);
    }

    const depthOf = (selectionSet: SelectionSetNode | undefined, depth: number, seen: Set<string>): number => {
      if (!selectionSet) return depth;
      let max = depth;
      for (const selection of selectionSet.selections) {
        if (selection.kind === Kind.FIELD) {
          if (selection.name.value.startsWith('__')) continue;
          max = Math.max(max, depthOf(selection.selectionSet, depth + 1, seen));
        } else if (selection.kind === Kind.INLINE_FRAGMENT) {
          max = Math.max(max, depthOf(selection.selectionSet, depth, seen));
        } else {
          const name = selection.name.value;
          const fragment = fragments.get(name);
          if (fragment && !seen.has(name)) {
            max = Math.max(max, depthOf(fragment.selectionSet, depth, new Set([...seen, name])));
          }
        }
      }
      return max;
    };

    return {
      OperationDefinition(node) {
        const depth = depthOf(node.selectionSet, 0, new Set());
        if (depth > maxDepth) {
          context.reportError(
            new GraphQLError(`La operación tiene profundidad ${depth}; el máximo permitido es ${maxDepth}.`, {
              nodes: [node],
              extensions: { code: 'QUERY_TOO_DEEP' },
            }),
          );
        }
      },
    };
  };
}
