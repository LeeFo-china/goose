ALTER TABLE public.workflow_definitions
DROP CONSTRAINT IF EXISTS workflow_definitions_category_check;

ALTER TABLE public.workflow_definitions
ADD CONSTRAINT workflow_definitions_category_check CHECK (
  category IN (
    'main',
    'sales',
    'signing',
    'construction',
    'procedure',
    'approval',
    'acceptance'
  )
);

UPDATE public.workflow_definitions
SET
  category = 'signing',
  updated_at = now()
WHERE category = 'construction'
  AND (
    workflow_key = 'project_signing'
    OR workflow_key LIKE 'project\_signing\_%' ESCAPE '\'
  );

DELETE FROM public.workflow_definition_bindings binding
USING public.workflow_definitions definition
WHERE binding.definition_id = definition.id
  AND binding.subject_type = 'project'
  AND binding.workflow_purpose = 'construction'
  AND definition.category = 'signing';
